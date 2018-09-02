const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const DirResolve = require('./DirResolve').default;
const delay = time => {
	return new Promise(resolve => {
		setTimeout(resolve, time);
	})
};
// const stat = (dirname) => {
// 	return new Promise((resolve, reject) => {
// 		fs.stat(dirname, (err, stats) => {
// 			if (err) {
// 				reject();
// 				return;
// 			}
// 			resolve(stats);
// 		});
// 	});
// };

const DefaultConfig = {
	isWatchBrowser: false, // 是否查看进度（调试模式）
	pageDownMax: 20, // 每个页面最多上传几张图片
	pageMax: 3, // 最多打开多少个页面
	httpPath: 'https://tinypng.com',
	imgReg: /(\.png$)|(\.jpeg$)|(\.jpg$)/,
};


class App {
	constructor(userConfig) {
		const config = Object.assign({}, DefaultConfig, userConfig);
		this.imgPath = config.imgPath; // 所要操作的文件夹路径
		this.distPath = config.distPath;
		this.browser = null; // 浏览器对象
		this.config = config;
		this.imgList = []; // 总共要处理的文件路径
		this.resolveArr = []; // 正打算处理的文件(路径)
		this.canUseUploadPage = []; // 可以用下载pages
		this.downPage = null; // 提供下载页面(暂定只有一个)
		this.tipCb = null; // tip回调
		this.browserConfig = { // 浏览器的操作
			headless: !config.isWatchBrowser, // 是否隐藏操作过程
			timeout: 0,
			devtools: true, // 是否打开调试
			executablePath: 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	  	};
		this._init();
	}
	tip(text) {
		this.tipCb && this.tipCb(text);
	}
	ontip(cb) {
		this.tipCb = cb;
	}
	// 检测是否可以进行操作
	async isCanResolve() {
		// 判断文件是不是一个文件夹
		// 注意（dist文件不能和imgPath一样，最好先进行判断）
		const imgPath = this.config.imgPath;
		const distPath = this.config.distPath;
		console.log(`要处理的文件夹：${imgPath},打包到${distPath}`);
		if (!imgPath || !distPath) {
			return false;
		}
		return true;
	}
	async _init() {
		const isCanResolve = this.isCanResolve();
		if (!isCanResolve) {
			this.tip('配置有问题');
			return;
		}
		console.log('puppeteer');
		console.log('launch');
		this.browser = await puppeteer.launch(this.browserConfig);
		console.log('openDownPage');
		await this.openDownPage();
		console.log('analysisImgPath');
		await this.analysisImgPath(); // 解析所有要处理的文件
		console.log('openUploadPage');
		await this.openUploadPage(); // 根据文件的多少和配置决定打开页面的页数
		console.log('startResolve');
		await this.startResolve();
		await this.browser.close();
		this.tip('处理完毕');
	}
	async startResolve() {
		this.tip(`要处理的文件有${this.imgList.length}个`);
		this.tip('开始初始化处理');
		const progressArr = this.canUseUploadPage.map(async (uploadPage, i) => {
			return this.goOnToReoslve(uploadPage);
		});
		await Promise.all(progressArr);
	}
	// 当有page可以使用的时候
	async goOnToReoslve(uploadPage) {
		const resolveArr = this.getResolveArr();
		if (resolveArr.length === 0) {
			return;
		}
		await this.uploadAndDown(resolveArr, uploadPage);
		await uploadPage.reload({
			timeout: 0,
		});
		await this.goOnToReoslve(uploadPage);
	}
	// 上传和下载（把一组图片交给一个页面）
	async uploadAndDown(resolveArr, canUploadPage) {
		if (!canUploadPage) {
			return true;
		}
		const self = this;
		const canDownPage = this.downPage;
		const imgPath = this.imgPath;
		const distPath = this.distPath;
		// 把resolveArr里的文件一起上传过去
		const promiseResolveArr = [];
		for(let i = 0; i < resolveArr.length; i++) {
			const filePath = resolveArr[i];
			await canUploadPage.waitFor(800 * i); // 防止被认出来==。
			console.log('ready uploadFile:', filePath);
			const uploadPromise = this.uploadFile(canUploadPage, filePath, i).then(async successImgLink => {
				if (!successImgLink) {
					throw "upload fail";
				}
				console.log('uploadFile success:', filePath);
				const disWidthPath = path.relative(imgPath, filePath);
				const distFileName = path.join(distPath, disWidthPath);
				console.log('ready download:', filePath,'to:', distFileName);
				const isSuccess = await self.download(canDownPage, successImgLink, distFileName);
				if (!isSuccess) {
					throw "upload fail";
				}
				console.log(`download:${isSuccess}`, filePath,'to:', distFileName);
			}).catch(err => {
				console.log('uploadFile fail filePath:', filePath);
				this.imgList.push(filePath);
			});
			promiseResolveArr.push(uploadPromise);
		}
		await Promise.all(promiseResolveArr);
		return true;
	}
	async openDownPage() {
		const downPage = await this.openPage(true);
		this.downPage = downPage;
		console.log('open down page success');
		await this.setDownloadFunc(downPage);
	}
	// 得到可以处理的文件路径
	getResolveArr() {
		if (this.imgList.length === 0) {
			return [];
		}
		const readyToResolveArr = []; // 准备去处理的数组
		const pageDownMax = this.config.pageDownMax;
		for(let i = 0; i < pageDownMax; i++) {
			if (this.imgList.length > 0) {
				const filePath = this.imgList.shift();
				readyToResolveArr.push(filePath);
			}
		}
		return readyToResolveArr;
	}
	// 打开上传页面
	async openUploadPage() {
		// 拦截图片使页面加载更快
		const resolveLength = this.imgList.length;
		const readyToOpenPage = Math.ceil(resolveLength / this.config.pageDownMax);
		const openPageLength = readyToOpenPage > this.config.pageMax ? this.config.pageMax : readyToOpenPage;
		const openLoadPageProArr = [];
		for (let i = 0; i < openPageLength; i++) {
			openLoadPageProArr.push(this.openPage(true).then(uploadPage => {
				console.log('open success');
				this.canUseUploadPage.push(uploadPage);
				return uploadPage;
			}));
		}
		await Promise.all(openLoadPageProArr);
	}
	// 根据文件数打开page(最多5个)
	async openPage(isInterceptedImg = false, goToPath = '') { // 是否屏蔽图片
		// 拦截图片使页面加载更快
		const page = await this.browser.newPage();
		if (isInterceptedImg) {
			await page.setRequestInterception(true);
			page.on('request', interceptedRequest => {
			if (interceptedRequest.url.endsWith('.png') || interceptedRequest.url.endsWith('.jpg'))
				interceptedRequest.abort();
			else
				interceptedRequest.continue();
			});
		}
		await page.goto(this.config.httpPath, {
			waitUntil: 'networkidle2',
			timeout: 0,
		});
		return page;
	}
	// 设置页面不下载图片（使网页打开更快一点）
	async setNoDownImg(page) {
		await page.setRequestInterception(true);
		page.on('request', interceptedRequest => {
			if (interceptedRequest.url.endsWith('.png') || interceptedRequest.url.endsWith('.jpg'))
			interceptedRequest.abort();
			else
			interceptedRequest.continue();
		});
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
	// 上次文件
	async uploadFile(page, uploadFilePath, index) {
		const fileInput = await page.$('input[type=file]');
		await fileInput.uploadFile(uploadFilePath);
		const successPromise = page.mainFrame().waitForSelector(`.files li:nth-child(${index + 1}) .success`);
		const failPromise = page.mainFrame().waitForSelector(`.files li:nth-child(${index + 1}) .error`);
		return Promise.race([successPromise, failPromise]).then(async () => {
			const downLink = await page.$eval(`.files li:nth-child(${index + 1}) .after a`, ev => ev.href);
			return downLink;
		});
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
					const isExists = fs.existsSync(parDir);
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
	async bufferStringToDown(bufferString, downPath) {
		function str2ab(str) { // Convert a UTF-8 String to an ArrayBuffer
		    var buf = new ArrayBuffer(str.length); // 1 byte for each char
		    var bufView = new Uint8Array(buf);
		    for (var i=0, strLen=str.length; i < strLen; i++) {
		      bufView[i] = str.charCodeAt(i);
		    }
		    return buf;
		}
		return new Promise(async resolve => {
			let buf = Buffer.from(str2ab(bufferString));
			// 查看所在的文件目录是否存在.没有就创建
			let isCanCreate = false;
			let parDir = path.join(downPath, '../');
			const mkdirArr = [];
			while (!isCanCreate) {
				const isExists = fs.existsSync(parDir);
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
	}
	// 下载文件
	async download(page, fileUrl, downPath) {
		const imgBuffer = await page.evaluate((fileUrl) => {
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
		    // const isDownSuccess = await window.fetch(fileUrl).then(res => res.arrayBuffer()).then(async imgBuffer => {
		    // 	const bufferString = arrayBufferToString(imgBuffer);// 流转换为字符串
			// 	console.log(bufferString)
			// 	const isSuccess = await window.fileDown(bufferString, downPath);
			// 	console.log(isSuccess)
		    // 	return isSuccess;
		    // });
			// return isDownSuccess;
			return window.fetch(fileUrl).then(res => res.arrayBuffer()).then(imgBuffer => {
				const bufferString = arrayBufferToString(imgBuffer);// 流转换为字符串
				return bufferString;
			});
		}, fileUrl);
		const isSuccess = await this.bufferStringToDown(imgBuffer, downPath);
		return isSuccess;
	}
}

export default App;
