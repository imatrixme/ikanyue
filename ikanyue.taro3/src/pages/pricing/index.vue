<template>
    <div>
        <h1>Pricing</h1>
    </div>
</template>

<script>
import Taro from '@tarojs/taro';
import { iNet } from '../../../utils/request';

var that;
export default {
    data() {
        return {
            title: 'Pricing',
        };
    },
    created() {
        that = this;
    },
    mounted() {},
};
</script>

<style lang="scss">
page {
    background-color: #f8f8f8;
}
</style>
