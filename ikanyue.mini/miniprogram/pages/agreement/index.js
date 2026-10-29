import { definePage } from '../../kit/page.js';
import { page } from '../../kit/api.js';
import { agreementFor } from '../../core/agreement.js';

definePage({
    data: () => ({ agreement: agreementFor('user') }),
    onLoad(query) {
        const agreement = agreementFor(query.type);
        this.set({ agreement });
        page.title(agreement.title);
    },
});
