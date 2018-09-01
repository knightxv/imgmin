const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('mz/fs');

class DirResolve {
	constructor(filterReg) {
		this.reg = filterReg;
		this.filterImg = [];
	}
	// 解析文件
	async analysisFile(parentDirName) {
		const isDir = await this.isDir(parentDirName);
		const self = this;
		if (isDir) {
			// 如果是否文件夹的话就迭代
			const fileList = await fs.readdir(parentDirName);
			const promiseArr = fileList.map(async fileName => {
				const isRegTest = self.reg.test(fileName); // 是否是想要的名字
				const filePatn = path.join(parentDirName, fileName);
				if (isRegTest) {
					self.filterImg.push(filePatn);
				} else {
					const isDir = await self.isDir(filePatn);
					await self.analysisFile(filePatn);
				}
			})
			await Promise.all(promiseArr);
		}
	}
	async isDir(dirName) {
		const dirInfo = await fs.stat(dirName);
		return dirInfo.isDirectory();
	}
	async resolve(dirName) {
		this.filterImg = [];
		const isDirectory = this.isDir(dirName);
		if (!isDirectory) {
			console.log('请选择正常的文件夹');
			return;
		}
		if (!this.reg) {
			console.log('请选择传入正则配置');
			return;
		}
		await this.analysisFile(dirName);
		return this.filterImg;
	}
}

const delay = time => {
	return new Promise(resolve => {
		setTimeout(resolve, time);
	})
};



module.exports = class App {
	constructor(config) {
		this.imgPath = config.imgPath; // 所要操作的文件夹路径
		this.distPath = config.distPath;
		this.browser = null; // 浏览器对象
		this.config = config;
		this.imgList = []; // 要处理的文件路径
		this.resolveArr = []; // 正打算处理的文件(路径)
		// this.canUseDownPage = []; // 可以用下载pages
		// this.downPage = null; // 提供下载页面
		this.page = null; // 打开的页面(暂时只有一个)
		this._init();
	}
	// 提示的回调
	tip(text) {

	}
	// 设置配置
	setConfig() {
		this.browserConfig = {
			  headless: !this.config.isWatchBrowser, // 是否隐藏操作过程
			  timeout: 0,
		};
	}
	// 检测是否可以进行操作
	async isCanResolve() {
		// 判断文件是不是一个文件夹
		// 注意（dist文件不能和imgPath一样，最好先进行判断）
		return true;
	}
	async _init() {
		this.setConfig(); //设置信息
		const isCanResolve = this.isCanResolve();
		if (!isCanResolve) {
			this.tip('配置有问题');
			return;
		}
		await this.open(); // 打开浏览器
		await this.openPage(); // 打开页面
		await this.analysisImgPath(); // 解析所有要处理的文件
		// console.log(this.canUseDownPage.length);
		// console.log(this.downPage)
		await this.startResolve();
		await this.browser.close();
		// const uploadFilePath = path.join(this.imgPath, 'test.png')
		// const successImgLink = await this.uploadFile(page, uploadFilePath); // 在哪个页面上传图片
		// console.log(successImgLink);
		// const filePathName = path.join(this.distPath, 'test.png');
		// const isSuccess = await this.download(page, successImgLink, filePathName);
		// if (isSuccess) {
		// 	console.log('下载成功');
		// } else {
		// 	console.log('下载失败');
		// }
	}
	async startResolve() {
		
		try {
			this.tip('开始处理');
			this.tip(`要处理的文件有${this.imgList.length}个`);
			const isResoveOver = await this.goToResolve();
			const self = this;
			const canUsePage = this.page;
			const imgPath = this.config.imgPath;
			const distPath = this.config.distPath;
			const promiseResolveArr = this.resolveArr.map(async (filePath, index) => {
				await self.uploadFile(canUsePage, filePath);
				await self.page.mainFrame().waitForSelector(`.files li:nth-child(${index + 1}) .success`);
				const successImgLink = await self.page.$eval(`.files li:nth-child(${index + 1}) .after a`, ev => ev.href);
				const disWidthPath = path.relative(imgPath, filePath);
				const distFileName = path.join(distPath, disWidthPath);
				const isSuccess = await self.download(canUsePage, successImgLink, distFileName);
				if (isSuccess) {
					this.tip(`下载成功:${distFileName}`);
				} else {
					this.tip(`下载失败${filePath}`);
				}
				return isSuccess;
			});
			await Promise.all(promiseResolveArr);
			if (!isResoveOver) {
				console.log('刷新页面');
				await canUsePage.reload();
				console.log('开始下一次处理');
				await this.startResolve();
			}
		} catch (err) {
			this.tip('报错了');
			console.log(err);
			this.tip('正在关闭');
			await this.browser.close();
			await delay(1000);
			this.tip('正在重启');
			this._init();
		}
	}
	async goToResolve() {
		this.resolveArr = [];
		const pageDownMax = this.config.pageDownMax;
		for(let i = 0; i < pageDownMax; i++) {
			if (this.imgList.length > 0) {
				const filePath = this.imgList.shift();
				this.resolveArr.push(filePath);
			}
		}
		return this.imgList.length === 0;
	}
	// 解析文件夹里面有多少个图片文件
	async analysisImgPath () {
		this.tip('正在解析文件目录');
		const imgPath = this.config.imgPath;
		const distPath = this.config.distPath;
		const dirRes = new DirResolve(this.config.imgReg);
		const fileList = await dirRes.resolve(imgPath);
		const filterList = fileList.filter(filePath => {
			const distWidthDistPath = path.relative(imgPath, filePath);
			const resolveToPath = path.join(distPath, distWidthDistPath);
			const isExit = fs.existsSync(resolveToPath);
			return !isExit;
		}); // 如果已经存在被打包过的文件就去掉
		this.imgList = filterList;
		this.tip('解析文件目录完毕');
	}
	// async pushDownPagePool(page) {
	// 	this.canUseDownPage.push(page);
	// }
	// 根据文件数打开page(最多5个)
	async openPage() {
		// const pageMax = this.config.pageMax;
		// const pageDownMax = this.config.pageDownMax;
		// const pageOpenNumber = Math.ceil(this.imgList.length / pageDownMax);
		// const pageDownOpenNumber = pageOpenNumber > pageMax ? pageMax : pageOpenNumber; // 实际要打开页面数
		// for(let i = 0; i < pageDownOpenNumber; i++) {
		// 	const page = await this.newPage(this.browser, this.config.httpPath);
		// 	this.pushDownPagePool(page);
		// }
		this.page = await this.newPage(this.browser, this.config.httpPath);
		await this.setDownloadFunc(this.page);
	}
	// isInterceptedImg是否屏蔽图片文件
	async newPage(browser, httpPath, isInterceptedImg) {
		const page = await browser.newPage();
		// page.on('request', interceptedRequest => {
		// if (interceptedRequest.url.endsWith('.png') || interceptedRequest.url.endsWith('.jpg'))
		//   interceptedRequest.abort();
		// else
		//   interceptedRequest.continue();
		// });
		await page.goto(httpPath);
		return page;
	}
	async open() {
		this.browser = await puppeteer.launch(this.browserConfig);
	}
	// 上次文件
	async uploadFile(page, uploadFilePath, index) {
		await page.waitFor(300); // 防止被认出来==。
		const fileInput = await page.$('input[type=file]');
		await fileInput.uploadFile(uploadFilePath);
	}
	// 设置下载函数（挂载到window.fileDown上(bufferString, downPath))
	async setDownloadFunc(page) {
		function str2ab(str) { // Convert a UTF-8 String to an ArrayBuffer
		    var buf = new ArrayBuffer(str.length); // 1 byte for each char
		    var bufView = new Uint8Array(buf);
		    for (var i=0, strLen=str.length; i < strLen; i++) {
		      bufView[i] = str.charCodeAt(i);
		    }
		    return buf;
		}
		// 在全局(window)装载fileDown对象
		await page.exposeFunction('fileDown', (bufferString, downPath) => {
			return new Promise(async resolve => {
				let buf = Buffer.from(str2ab(bufferString));
				// 查看所在的文件目录是否存在.没有就创建
				let isCanCreate = false;
				let parDir = path.join(downPath, '../');
				const mkdirArr = [];
				while (!isCanCreate) {
					const isExists = await fs.exists(parDir);
					if (isExists) {
						isCanCreate = true;
					} else {
						mkdirArr.unshift(parDir);
						parDir = path.join(parDir, '../');
					}
				}
				mkdirArr.forEach(dir => {
					try {
						fs.mkdirSync(dir);
					} catch(err) {
						console.log(err);
					}
				})
				// await 
				fs.writeFile(downPath, buf, async (err, text) => {
			        if (err) {
			            console.log(err);
			            resolve(false);
			            return;
			        }
			        resolve(true);
				});
			});
		});
	}
	// 下载文件
	async download(page, fileUrl, downPath) {
		const isSuccess = await page.evaluate(async (fileUrl, downPath) => {
		    function arrayBufferToString(buffer){ // Convert an ArrayBuffer to an UTF-8 String
			    var bufView = new Uint8Array(buffer);
			    var length = bufView.length;
			    var result = '';
			    var addition = Math.pow(2,8)-1;
			    for(var i = 0;i<length;i+=addition){
			        if(i + addition > length){
			            addition = length - i;
			        }
			        result += String.fromCharCode.apply(null, bufView.subarray(i,i+addition));
			    }
			    return result;
			}
		    const isDownSuccess = await window.fetch(fileUrl).then(res => res.arrayBuffer()).then(async imgBuffer => {
		    	const bufferString = arrayBufferToString(imgBuffer);// 流转换为字符串
		    	const isSuccess = await window.fileDown(bufferString, downPath);
		    	return isSuccess;
		    });
		    return isDownSuccess;
		}, fileUrl, downPath);
		return isSuccess;
	}
}

// new App(config);


// // 拦截图片使页面加载更快
// puppeteer.launch().then(async browser => {
//   const page = await browser.newPage();
//   await page.setRequestInterception(true);
//   page.on('request', interceptedRequest => {
//     if (interceptedRequest.url.endsWith('.png') || interceptedRequest.url.endsWith('.jpg'))
//       interceptedRequest.abort();
//     else
//       interceptedRequest.continue();
//   });
//   await page.goto('https://example.com');
//   await browser.close();
// });