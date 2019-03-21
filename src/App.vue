<template>
    <div id="app">
        <VideoFrame/>
    </div>
</template>

<script>
    import VideoFrame from './components/VideoFrame.vue'

    export default {
        name: 'app',
        components: {
            VideoFrame
        }
    }
</script>

<style>
    #app {
        font-family: 'Avenir', Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;
        margin-top: 60px;
    }
</style>
