<template>
  <div id="wrapper">
    <button class="alt" @click="openFile">选择要打包的文件目录</button>
    <button class="alt" @click="openDistFile">选择打包之后的文件目录</button>
    <button @click="begin">开始打包</button>
    <div>{{ tip }}</div>
  </div>
</template>

<script>
  import SystemInformation from './LandingPage/SystemInformation'
  import App from '../util/app';
  export default {
    name: 'landing-page',
    components: { SystemInformation },
    data() {
      return {
        tip: '',
      };
    },
    methods: {
      created() {
        this.selectFile = null;// 选择压缩目录
        this.distFile = null; // 文件压缩之后放置的地方
      },
      open (link) {
        this.$electron.shell.openExternal(link)
      },
      async openFile() {
        // this.$electron.shell.showItemInFolder()
        const selectFile = await this.openDirSelect();
        this.selectFile = selectFile;
      },
      async openDistFile() {
        const selectFile = await this.openDirSelect();
        this.distFile = selectFile;
      },
      async begin() {
        if (this.selectFile) {
          const config = {
            imgPath: this.selectFile, // 要处理的文件路径
	          distPath: this.distFile, // 处理完之后文件要放哪
          };
          const app = new App(config);
          app.ontip((text) => {
            this.tip = text;
            console.log(text);
          });
        } else {
          console.log('请选择要压缩的目录');
        }
      },
      // 删除文件夹
      removeDir(dir) {
        return new Promise(resolve => {
          rimraf(dir, (val) => {
            console.log(val);
            resolve();
          });
        });
      },
      // 读取文件夹
      AsyncReaddir(pathName) {
        return new Promise(resolve => {
          fs.readdir(pathName, (err, stat,a) => {
            if (err) {
              resolve(null);
              return;
            }
            resolve(stat);
          })
        });
      },
      openDirSelect() {
        return new Promise(resolve => {
          const {dialog} = this.$electron.remote;
          dialog.showOpenDialog({
            // defaultPath :__static,
            title: '选择文件目录',
            properties: [
                // 'openFile',
                'openDirectory',
            ],
          },function(res){
            if (res) {
              const selectFile = res[0];
              resolve(res[0]);
            } else {
              resolve(null);
            }
          });
        });
      }
    }
  }
</script>

<style>
  @import url('https://fonts.googleapis.com/css?family=Source+Sans+Pro');

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body { font-family: 'Source Sans Pro', sans-serif; }


  button {
    font-size: .8em;
    cursor: pointer;
    outline: none;
    padding: 0.75em 2em;
    border-radius: 2em;
    display: inline-block;
    color: #fff;
    background-color: #4fc08d;
    transition: all 0.15s ease;
    box-sizing: border-box;
    border: 1px solid #4fc08d;
  }

  button.alt {
    color: #42b983;
    background-color: transparent;
  }
</style>
