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

const DefaultConfig = {
	isWatchBrowser: false, // 是否查看进度（调试模式）
	pageDownMax: 20, // 每个页面最多上传几张图片
	pageMax: 5, // 最多打开多少个页面
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
		this.tip(`要处理的文件夹：${imgPath},打包到${distPath}`);
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
		this.browser = await puppeteer.launch(this.browserConfig);
		await this.openDownPage();
		await this.analysisImgPath(); // 解析所有要处理的文件
		await this.openUploadPage(); // 根据文件的多少和配置决定打开页面的页数
		await this.startResolve();
		await this.browser.close();
		this.tip('处理完毕');
	}
	async startResolve() {
		this.tip(`要处理的文件有${this.imgList.length}个`);
		this.tip('开始初始化处理');
		const self = this;
		const progressArr = this.canUseUploadPage.map(uploadPage => {
			const resolveArr = this.getResolveArr();
			return this.uploadAndDown(resolveArr, uploadPage).then(async() => {
				if (self.imgList.length > 0) {
					await uploadPage.reload(); // 刷新页面
					await self.goOnToReoslve(uploadPage);
				}
			});
		});
		await Promise.all(progressArr);
		// 从upload池里去拿
		// await this.startResolve(); // 开始新一轮
		// if (!isResoveOver) {
		// 	this.tip('刷新页面');
		// 	await uploadPage.reload();
		// 	this.tip('开始下一次处理');
		// 	await this.startResolve();
		// }
	}
	// 当有page可以使用的时候
	async goOnToReoslve(uploadPage) {
		const resolveArr = this.getResolveArr();
		if (resolveArr.length === 0) {
			return;
		}
		await this.uploadAndDown(resolveArr, uploadPage);
		await uploadPage.reload();
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
		const promiseResolveArr = resolveArr.map(async (filePath, index) => {
			await self.uploadFile(canUploadPage, filePath);
			await canUploadPage.mainFrame().waitForSelector(`.files li:nth-child(${index + 1}) .success`);
			const successImgLink = await canUploadPage.$eval(`.files li:nth-child(${index + 1}) .after a`, ev => ev.href);
			const disWidthPath = path.relative(imgPath, filePath);
			const distFileName = path.join(distPath, disWidthPath);
			const isSuccess = await self.download(canDownPage, successImgLink, distFileName);
			if (isSuccess) {
				this.tip(`下载成功:${distFileName}`);
			} else {
				this.tip(`下载失败${filePath}`);
			}
			return isSuccess;
		});
		await Promise.all(promiseResolveArr);
		return true;
	}
	async openDownPage() {
		const downPage = await this.openPage();
		this.downPage = downPage;
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
		const readyToOpenPage = Math.ceil(resolveLength / 5);
		const openPageLength = readyToOpenPage > this.config.maxOpenPage ? this.config.maxOpenPage : readyToOpenPage;
		for (let i = 0; i < openPageLength; i++) {
			const uploadPage = await this.openPage(true);
			this.canUseUploadPage.push(uploadPage);
		}
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
		await page.goto(this.config.httpPath);
		return page;
	}
	// 设置页面不下载图片（使网页打开更快一点）
	async setNoDownImg(page) {
		await page.setRequestInterception(true);
		page.on('request', interceptedRequest => {
			console.log(interceptedRequest.url)
			debugger;
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
