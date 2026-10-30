import { definePage } from '../../kit/page.js';
import { nav, ui } from '../../kit/api.js';
import { buildGrantPayload, normalizePackages, workbenchErrorMessage } from '../../core/workbench.js';
import { Api } from '../../services/apis.js';
import { withCommandKey } from '../../services/commandKeys.js';

// Granting lessons offline: an existing package and price, optionally the amount actually received.
definePage({
    data: () => ({
        studentId: '', studentName: '', packages: [], packageIndex: 0, priceIndex: 0, paidAmount: '',
        loading: false, errorMessage: '', actionLoading: false,
    }),
    computed: {
        state: (d) => {
            if (d.loading) return 'loading';
            if (d.errorMessage) return 'error';
            return d.packages.length ? 'ready' : 'empty';
        },
        chosen: (d) => d.packages[d.packageIndex] || null,
        priceOptions: (d) => (d.packages[d.packageIndex]?.prices || []),
        submitReady: (d) => !d.actionLoading && d.packages.length > 0,
    },
    onLoad(query) {
        this.set({ studentId: query.id || '', studentName: query.name || '学员' });
        this.loadPackages();
    },
    methods: {
        retry() {
            return this.loadPackages();
        },
        changePackage(event) {
            this.set({ packageIndex: Number(event.detail.value) || 0, priceIndex: 0 });
        },
        changePrice(event) {
            this.set({ priceIndex: Number(event.detail.value) || 0 });
        },
        async loadPackages() {
            await this.set({ loading: true, errorMessage: '' });
            try {
                await this.set({ packages: normalizePackages(await Api.listWorkbenchPackages()), packageIndex: 0, priceIndex: 0 });
            } catch (error) {
                await this.set({ errorMessage: workbenchErrorMessage(error, '课包暂时无法加载') });
            } finally {
                await this.set({ loading: false });
            }
        },
        async submit() {
            const { actionLoading, chosen, paidAmount, priceIndex, studentId, studentName } = this.data;
            if (actionLoading || !chosen || !studentId) return;
            const { error, payload, summary } = buildGrantPayload({
                packageId: chosen.packageId, priceVersionId: chosen.prices[priceIndex]?.priceVersionId, paidAmount,
            }, this.data.packages);
            if (error) {
                ui.toast(error);
                return;
            }
            const confirmed = await ui.confirm({ title: `给${studentName}发课时`, content: summary, okText: '确认发放' });
            if (!confirmed) return;
            await this.set({ actionLoading: true });
            try {
                await withCommandKey(`grant-lessons:${studentId}:${payload.priceVersionId}:${payload.paidAmount ?? ''}`,
                    (key) => Api.grantWorkbenchLessons(studentId, payload, key));
                ui.toast('课时已发放', { kind: 'success' });
                nav.back();
            } catch (failure) {
                ui.toast(workbenchErrorMessage(failure, '发课时失败，请重试'), { duration: 2600 });
            } finally {
                await this.set({ actionLoading: false });
            }
        },
    },
});
