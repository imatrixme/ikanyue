const test = require('node:test');
const assert = require('node:assert/strict');

const { createBaseMocks, createWechatLoginApp, loadWechatLoginHandler } = require('./support/wechatLoginHelpers');

test('wechat login accepts query auth code and parsed form body payloads', async () => {
    let updatePayload = null;
    const { handler, restore } = loadWechatLoginHandler(
        createBaseMocks({
            session: { unionid: '' },
            collectionApi: {
                async getList(_page, _perPage, options = {}) {
                    if (options.filter?.includes('cellphone=')) {
                        return {
                            items: [
                                {
                                    id: 'student_form',
                                    sn: 'sn_form',
                                    cellphone: '13800138088',
                                    nickName: '',
                                    avatar: '',
                                    gender: '',
                                    age: '',
                                    blocked: false,
                                },
                            ],
                        };
                    }
                    return { items: [] };
                },
                async update(id, data) {
                    updatePayload = data;
                    return {
                        id,
                        sn: 'sn_form',
                        cellphone: data.cellphone,
                        avatar: data.avatar,
                        nickName: data.nickName,
                        gender: data.gender,
                        age: data.age,
                    };
                },
            },
        })
    );

    try {
        const body = new URLSearchParams();
        body.set('phone', JSON.stringify({ encryptedData: 'encrypted-data', iv: 'iv-data' }));
        body.set(
            'userInfo',
            JSON.stringify({
                nickname: '表单用户',
                avatar: 'https://example.com/form-avatar.png',
                gender: '2',
                age: '11',
            })
        );
        body.set('rawData', '{"nickname":"表单用户"}');
        body.set('signature', 'signature');

        const response = await createWechatLoginApp(handler).request('http://localhost/v1/user/wechat-login?authCode=query-code', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-real-ip': '127.0.0.1',
            },
            body,
        });
        const payload = await response.json();

        assert.equal(payload.code, 10000);
        assert.equal(payload.data.nickName, '表单用户');
        assert.equal(updatePayload.age, 11);
        assert.equal(updatePayload.gender, '2');
        assert.equal(updatePayload.lastLoginIp, '127.0.0.1');
    } finally {
        restore();
    }
});

test('wechat login accepts FormData parsed bodies', async () => {
    let updatedLoginIp = null;
    const { handler, restore } = loadWechatLoginHandler(
        createBaseMocks({
            collectionApi: {
                async getList(_page, _perPage, options = {}) {
                    if (options.filter?.includes('cellphone=')) {
                        return {
                            items: [
                                {
                                    id: 'student_formdata',
                                    sn: 'sn_formdata',
                                    cellphone: '13800138077',
                                    nickName: '',
                                    avatar: '',
                                    gender: '',
                                    age: '',
                                    blocked: false,
                                },
                            ],
                        };
                    }
                    return { items: [] };
                },
                async update(id, data) {
                    updatedLoginIp = data.lastLoginIp;
                    return {
                        id,
                        sn: 'sn_formdata',
                        cellphone: data.cellphone,
                        avatar: data.avatar,
                        nickName: data.nickName,
                    };
                },
            },
        })
    );

    try {
        const body = new FormData();
        body.set('auth_code', 'formdata-code');
        body.set('phone', JSON.stringify({ encryptedData: 'encrypted-data', iv: 'iv-data' }));
        body.set('userInfo', JSON.stringify({ nickName: 'FormData 用户' }));
        body.set('rawData', '{}');
        body.set('signature', 'signature');

        const result = await handler({
            req: {
                header(name) {
                    return {
                        'content-type': 'multipart/form-data',
                        'x-forwarded-for': '10.0.0.1',
                    }[name.toLowerCase()];
                },
                query() {
                    return {};
                },
                async parseBody() {
                    return body;
                },
            },
            error(code, message) {
                return { code, message, data: null };
            },
            data(data) {
                return { code: 10000, message: null, data };
            },
        });

        assert.equal(result.code, 10000);
        assert.equal(result.data.nickName, 'FormData 用户');
        assert.equal(updatedLoginIp, '10.0.0.1');
    } finally {
        restore();
    }
});
