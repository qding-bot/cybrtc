import Vue           from 'vue'
import App           from './App.vue'
import VueNativeSock from 'vue-native-websocket'

Vue.config.productionTip = false;


Vue.use(VueNativeSock, 'wss://gbgeujsgda.execute-api.us-east-1.amazonaws.com/test', {
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 3000
});

new Vue({
    render: h => h(App),
}).$mount('#app');
