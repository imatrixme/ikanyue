package control

import (
	"os"
	"runtime"
	"strconv"
	"strings"

	"kanyue.gateway/internal/telemetry"
)

// writeProcessMetrics adds what a soak test watches for leaks: resident memory
// (Linux only), the Go heap and the goroutine count, under their usual names.
func writeProcessMetrics(x *telemetry.Exposition) {
	if rss, ok := residentBytes(); ok {
		x.Family("process_resident_memory_bytes", "gauge", "Resident memory size in bytes.")
		x.Sample("process_resident_memory_bytes", float64(rss))
	}
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	x.Family("go_memstats_heap_inuse_bytes", "gauge", "Bytes in in-use heap spans.")
	x.Sample("go_memstats_heap_inuse_bytes", float64(mem.HeapInuse))
	x.Family("go_memstats_sys_bytes", "gauge", "Bytes obtained from the system.")
	x.Sample("go_memstats_sys_bytes", float64(mem.Sys))
	x.Family("go_goroutines", "gauge", "Goroutines that currently exist.")
	x.Sample("go_goroutines", float64(runtime.NumGoroutine()))
}

// residentBytes reads the second field of /proc/self/statm, in pages.
func residentBytes() (int64, bool) {
	raw, err := os.ReadFile("/proc/self/statm")
	if err != nil {
		return 0, false
	}
	fields := strings.Fields(string(raw))
	if len(fields) < 2 {
		return 0, false
	}
	pages, err := strconv.ParseInt(fields[1], 10, 64)
	if err != nil {
		return 0, false
	}
	return pages * int64(os.Getpagesize()), true
}
