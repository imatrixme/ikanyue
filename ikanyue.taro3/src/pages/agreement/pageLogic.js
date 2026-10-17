// Product draft of the login agreements. Operations reviews the wording and keeps the
// WeChat platform privacy guide consistent with the privacy policy below.
const AGREEMENTS = Object.freeze({
    user: Object.freeze({
        title: '用户协议',
        sections: Object.freeze([
            { heading: '服务内容', body: '看乐艺术小程序为学员提供活动浏览、课程购买、课时预约、积分与实物领取等服务，为教师提供预约处理与可预约时间设置。' },
            { heading: '账号', body: '你可以使用微信绑定的手机号或看乐分配的手机号与密码登录。请妥善保管账号，账号下的预约、购买与取消操作视为本人操作。' },
            { heading: '预约与取消', body: '预约在教师确认后生效。取消、改期与退款按页面展示的规则执行，规则以下单或预约时页面显示的版本为准。' },
            { heading: '付款与退款', body: '课程付款通过微信支付完成，退款原路退回。未支付订单会在创建 30 分钟后自动关闭。' },
            { heading: '使用规范', body: '请勿冒用他人身份、干扰系统运行或以不正当方式获取积分和课时。违反规范的，看乐可以限制相关功能。' },
            { heading: '联系与变更', body: '协议更新时会在小程序内提示。对服务有疑问，可以联系所在校区的前台或教务老师。' },
        ]),
    }),
    privacy: Object.freeze({
        title: '隐私政策',
        sections: Object.freeze([
            { heading: '我们收集的信息', body: '登录时收集你的手机号和微信登录标识；你主动填写的昵称、姓名、性别、年龄和地区；使用服务产生的课程、预约、订单与积分记录。' },
            { heading: '使用目的', body: '上述信息仅用于识别身份、安排课程与预约、处理付款与退款、发放积分和必要的活动联系，不用于与服务无关的用途。' },
            { heading: '共享', body: '付款由微信支付处理；教师只能看到与其课程相关的学员姓名、预约时间和备注。除法律法规要求外，我们不会向其他第三方提供你的个人信息。' },
            { heading: '存储与保护', body: '信息的访问受到权限控制，只有提供服务所需的人员可以查看。账号注销或服务终止后，我们会在法定期限届满后删除或匿名化处理。' },
            { heading: '你的权利', body: '你可以在“我的 - 个人资料”中查看和修改资料，也可以联系校区前台申请导出、更正或删除你的信息，以及注销账号。' },
            { heading: '未成年人', body: '未满 14 周岁的学员，请在监护人同意和陪同下使用本服务。' },
        ]),
    }),
});

const agreementFor = (type) => AGREEMENTS[type] || AGREEMENTS.user;

export { AGREEMENTS, agreementFor };
