const COURSE_CREDIT_SEED = Object.freeze({
    courseSpecs: [
        { code: 'VOCAL-ADULT-1V1-60', name: '成人声乐一对一 60 分钟', deliveryMode: 'one_to_one', durationMinutes: 60 },
        { code: 'SIGHT-SINGING-GROUP-60', name: '视唱练耳小组课 60 分钟', deliveryMode: 'group', durationMinutes: 60 },
        { code: 'CHOIR-GROUP-90', name: '合唱团课 90 分钟', deliveryMode: 'group', durationMinutes: 90 },
    ],
    creditTypes: [
        { code: 'GENERAL-CREDIT-CNY', name: '通用课程点', kind: 'universal', consumable: false, referenceUnitValue: 1 },
        { code: 'VOCAL-ADULT-1V1-60-CREDIT', name: '成人声乐一对一课点', kind: 'course', courseSpecCode: 'VOCAL-ADULT-1V1-60', consumable: true },
        { code: 'SIGHT-SINGING-GROUP-60-CREDIT', name: '视唱练耳小组课点', kind: 'course', courseSpecCode: 'SIGHT-SINGING-GROUP-60', consumable: true },
        { code: 'CHOIR-GROUP-90-CREDIT', name: '合唱团课点', kind: 'course', courseSpecCode: 'CHOIR-GROUP-90', consumable: true },
    ],
    packages: [
        {
            code: 'VOCAL-ADULT-10',
            name: '成人声乐十节套餐',
            listAmount: 3000,
            saleAmount: 2800,
            grants: [{ creditTypeCode: 'VOCAL-ADULT-1V1-60-CREDIT', quantity: 10 }],
        },
        {
            code: 'VOCAL-GROWTH-MIXED',
            name: '声乐成长组合套餐',
            listAmount: 3000,
            saleAmount: 2800,
            grants: [
                { creditTypeCode: 'VOCAL-ADULT-1V1-60-CREDIT', quantity: 8 },
                { creditTypeCode: 'SIGHT-SINGING-GROUP-60-CREDIT', quantity: 2 },
            ],
        },
    ],
});

module.exports = { COURSE_CREDIT_SEED };
