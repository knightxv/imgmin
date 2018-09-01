const path = require('path');
const fs = require('mz/fs')

// (async () => {
// 	// await fs.exists(imgPath);
// 	const imgDirPath = 'D:/project/puppeteer/imagemin/src/test';
// 	const dirRes = new DirResolve(/(\.png$)|(\.jpeg$)|(\.jpg$)/);
// 	const fileList = await dirRes.resolve(imgDirPath);
// 	console.log(fileList);
// })()

module.exports = class DirResolve {
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





// fs.stat(imgPath, (err, pathInfo) => {
// 	console.log(err);
// 	if (err) {
// 		console.log(err);
// 		return;
// 	}
// 	const isDirectory = pathInfo.isDirectory();
// 	if (!isDirectory) {
// 		console.log('请选择正常的文件夹');
// 		return;
// 	}
// 	fs.readdir
// 	console.log(pathInfo);
// });
