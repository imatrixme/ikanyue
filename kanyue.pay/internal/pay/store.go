package pay

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sync"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Row is one versioned gateway entity; every money change replaces a row at version+1.
type Row struct {
	ID      string         `json:"id"`
	Kind    string         `json:"kind"`
	Owner   string         `json:"owner"`
	Version int            `json:"version"`
	Data    map[string]any `json:"data"`
}

// Mutation writes Row only if the stored version is still Expected (0 creates).
type Mutation struct {
	Row      Row
	Expected int
}

// Where filters on row data by equality; Not matches every other value, including a missing key.
type Where map[string]any

type Not struct{ Value any }

type Store interface {
	Get(id string) (*Row, error)
	List(kind, owner string, where Where) ([]Row, error)
	Commit(changes []Mutation) error
}

// next is a new version of row with patch merged in; a nil patch value removes the key.
func next(row Row, patch map[string]any) Row {
	data := make(map[string]any, len(row.Data)+len(patch))
	for key, value := range row.Data {
		data[key] = value
	}
	for key, value := range patch {
		if value == nil {
			delete(data, key)
		} else {
			data[key] = value
		}
	}
	row.Data = data
	row.Version++
	return row
}

func insert(row Row) Mutation { return Mutation{Row: row, Expected: 0} }
func update(row Row) Mutation { return Mutation{Row: row, Expected: row.Version - 1} }

func fresh(id, kind, owner string, data map[string]any) Row {
	return Row{ID: id, Kind: kind, Owner: owner, Version: 1, Data: data}
}

// clone round-trips through JSON, so callers see the numbers a database read would return.
func clone(row Row) Row {
	var copied Row
	if err := json.Unmarshal(jsonBytes(row), &copied); err != nil {
		panic(err)
	}
	return copied
}

func matches(data map[string]any, where Where) bool {
	for key, expected := range where {
		actual := data[key]
		if not, ok := expected.(Not); ok {
			if actual == not.Value {
				return false
			}
		} else if actual != expected {
			return false
		}
	}
	return true
}

// MemoryStore is the all-or-nothing reference store used by tests.
type MemoryStore struct {
	mu    sync.Mutex
	rows  map[string]Row
	order []string
}

func NewMemoryStore() *MemoryStore { return &MemoryStore{rows: map[string]Row{}} }

func (s *MemoryStore) Get(id string) (*Row, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.rows[id]
	if !ok {
		return nil, nil
	}
	copied := clone(row)
	return &copied, nil
}

func (s *MemoryStore) List(kind, owner string, where Where) ([]Row, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	rows := []Row{}
	for _, id := range s.order {
		row := s.rows[id]
		if row.Kind == kind && row.Owner == owner && matches(row.Data, where) {
			rows = append(rows, clone(row))
		}
	}
	return rows, nil
}

func (s *MemoryStore) Commit(changes []Mutation) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	seen := map[string]bool{}
	for _, change := range changes {
		if seen[change.Row.ID] || s.rows[change.Row.ID].Version != change.Expected {
			return conflict()
		}
		if change.Row.Version != change.Expected+1 {
			return fail("INVALID_VERSION", 400)
		}
		seen[change.Row.ID] = true
	}
	for _, change := range changes {
		if _, exists := s.rows[change.Row.ID]; !exists {
			s.order = append(s.order, change.Row.ID)
		}
		s.rows[change.Row.ID] = clone(change.Row)
	}
	return nil
}

const entities = "pay_entities"

// PocketBaseStore keeps rows in the embedded pay_entities collection. A commit
// checks every expected version inside one write transaction, so concurrent
// money updates either all apply or fail with CONCURRENT_CHANGE.
type PocketBaseStore struct{ App core.App }

func (s PocketBaseStore) Get(id string) (*Row, error) {
	record, err := s.App.FindRecordById(entities, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	row, err := decode(record)
	return &row, err
}

var filterKey = regexp.MustCompile(`^[a-zA-Z]+$`)

func (s PocketBaseStore) List(kind, owner string, where Where) ([]Row, error) {
	query := s.App.RecordQuery(entities).AndWhere(dbx.HashExp{"kind": kind, "owner": owner})
	index := 0
	for key, value := range where {
		if !filterKey.MatchString(key) {
			return nil, fail("INVALID_FILTER", 400)
		}
		operator := "="
		if not, ok := value.(Not); ok {
			operator, value = "IS NOT", not.Value
		}
		// json_extract yields 1/0 for booleans and NULL for a missing key; IS NOT keeps NULL as "other".
		if b, ok := value.(bool); ok {
			value = 0
			if b {
				value = 1
			}
		}
		// Placeholders are unique per condition: dbx merges same-named params, and HashExp uses p0, p1, ...
		path, param := fmt.Sprintf("wherePath%d", index), fmt.Sprintf("whereValue%d", index)
		index++
		query = query.AndWhere(dbx.NewExp("json_extract([[data]], {:"+path+"}) "+operator+" {:"+param+"}",
			dbx.Params{path: "$." + key, param: value}))
	}
	records := []*core.Record{}
	if err := query.OrderBy("created ASC", "id ASC").All(&records); err != nil {
		return nil, err
	}
	rows := make([]Row, 0, len(records))
	for _, record := range records {
		row, err := decode(record)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func (s PocketBaseStore) Commit(changes []Mutation) error {
	for _, change := range changes {
		if change.Row.Version != change.Expected+1 {
			return fail("INVALID_VERSION", 400)
		}
	}
	return s.App.RunInTransaction(func(tx core.App) error {
		collection, err := tx.FindCachedCollectionByNameOrId(entities)
		if err != nil {
			return err
		}
		for _, change := range changes {
			record, err := tx.FindRecordById(entities, change.Row.ID)
			switch {
			case errors.Is(err, sql.ErrNoRows):
				if change.Expected != 0 {
					return conflict()
				}
				record = core.NewRecord(collection)
				record.Set("id", change.Row.ID)
			case err != nil:
				return err
			case record.GetInt("version") != change.Expected:
				return conflict()
			}
			record.Set("kind", change.Row.Kind)
			record.Set("owner", change.Row.Owner)
			record.Set("version", change.Row.Version)
			record.Set("data", change.Row.Data)
			if err := tx.Save(record); err != nil {
				return err
			}
		}
		return nil
	})
}

func decode(record *core.Record) (Row, error) {
	row := Row{ID: record.Id, Kind: record.GetString("kind"), Owner: record.GetString("owner"),
		Version: record.GetInt("version")}
	err := record.UnmarshalJSONField("data", &row.Data)
	return row, err
}
