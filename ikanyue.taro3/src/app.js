import { createApp } from "vue";

import {
    Toast,
    Button,
    Empty,
    Tag,
    Icon,
    ActionSheet,
    Dialog,
    Popup,
    OverLay,
    Form,
    FormItem,
    Cell,
    CellGroup,
    Picker
} from "@nutui/nutui-taro";
import "@nutui/nutui-taro/dist/style.css";

import "./app.scss";

const App = createApp({
    onShow(options) {}
    // 入口组件不需要实现 render 方法，即使实现了也会被 taro 所覆盖
});

App.use(Button)
    .use(Toast)
    .use(Empty)
    .use(Tag)
    .use(Icon)
    .use(ActionSheet)
    .use(Dialog)
    .use(Popup)
    .use(OverLay)
    .use(Form)
    .use(FormItem)
    .use(Cell)
    .use(CellGroup)
    .use(Picker);

export default App;
