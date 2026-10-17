<template>
    <page-chrome class="agreement-page">
        <view v-for="section in agreement.sections" :key="section.heading" class="agreement-section">
            <text class="agreement-section__heading">{{ section.heading }}</text>
            <text class="agreement-section__body" user-select>{{ section.body }}</text>
        </view>
    </page-chrome>
</template>

<script>
import Taro from '@tarojs/taro';
import PageChrome from '../../components/PageChrome.vue';
import { agreementFor } from './pageLogic';
import './index.scss';

export default {
    components: { PageChrome },
    data() {
        return { agreement: agreementFor('user') };
    },
    onLoad(query) {
        this.agreement = agreementFor(query?.type);
        Taro.setNavigationBarTitle({ title: this.agreement.title });
    },
};
</script>
