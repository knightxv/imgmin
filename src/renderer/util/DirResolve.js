const path = require('path');
const fs = require('fs');

const stat = (dirname) => {
	return new Promise((resolve, reject) => {
		fs.stat(dirname, (err, stats) => {
			if (err) {
				reject();
				return;
			}
			resolve(stats);
		});
	});
};
const readdir = (dirname) => {
	return new Promise((resolve, reject) => {
		fs.readdir(dirname, (err, stats) => {
			if (err) {
				reject();
				return;
			}
			resolve(stats);
		});
	});
};
export default class DirResolve {
	constructor(filterReg) {
		this.reg = filterReg;
		this.filterImg = [];
	}
	// 解析文件
	async analysisFile(parentDirName) {
		parentDirName = parentDirName.replace(/\//g, '\\\\');
		const isDir = await this.isDir(parentDirName);
		const self = this;
		if (!isDir) {
			return;
		}
		// 如果是否文件夹的话就迭代
		console.log('read dir');
		const fileList = await readdir(parentDirName);
		console.log('readdir', parentDirName, fileList);
		const promiseArr = fileList.map(async fileName => {
			const isRegTest = self.reg.test(fileName); // 是否是想要的名字
			const filePatn = path.join(parentDirName, fileName);
			if (isRegTest) {
				self.filterImg.push(filePatn);
			} else {
				const isDir = await self.isDir(filePatn);
				if (!isDir) {
					return;
				}
				await self.analysisFile(filePatn);
			}
		})
		await Promise.all(promiseArr);
		console.log('analysisFile end');
	}
	async isDir(dirName) {
		if (dirName.indexOf('.') != -1) {
			return false;
		}
		const dirInfo = await stat(dirName);
		console.log('isDir:', dirName, dirInfo);
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

