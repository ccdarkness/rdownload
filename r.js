var READLINE = require('readline');
var URL = require('url');
var HTTPS = require('https');
var HTTP = require('http');
var FS = require('fs');
var PATH = require('path');

var API_KEY='OkwjSV5Nq39mpSsk7Y3vGGvT';
var SECRET_KEY='F7X2M3WL1YBuGTW1lyWKHnN9QzZ5Vbx5';
var ACCESS_TOKEN_URL='https://openapi.baidu.com/oauth/2.0/authorize?response_type=token&client_id='+API_KEY+'&redirect_uri=oob&scope=netdisk';
var ACCESS_TOKEN='';
var ACCESS_TOKEN_FILE='ACCESS_TOKEN.DATA';
var USE_REST_API_URL='https://pcs.baidu.com/rest/2.0/pcs/quota?method=info&access_token=';
var ROOT_PATH='/apps/rdownload/';//网盘路径
var SAVE_PATH='./rdownload/';//本地保存路径
var DOWN_LIST=new Array();
var DOWN_LIST_NUMBER=3;//下载线程数


main();
setInterval(function(){
	if((DOWN_LIST.length+1)<=DOWN_LIST_NUMBER){
		main();
	}
	show_download();
}, 20000);


//入口函数
function main(){
	FS.exists(ACCESS_TOKEN_FILE, function (exists) {
		if(exists){
			//读取授权文件
			FS.readFile(ACCESS_TOKEN_FILE, 'utf8', function (err, data) {
				if (err) throw err;
				ACCESS_TOKEN=data;
				USE_REST_API_URL=USE_REST_API_URL+ACCESS_TOKEN;

				//请求使用REST API,并判断是否授权成功
				HTTPS.get(USE_REST_API_URL, function(res) {
						console.log(res.statusCode); 
						if (res.statusCode=='200'){
							console.log('登陆成功！');
							get_file_list(ROOT_PATH);
						}else{
							console.log('登陆失败！');
						};
					}).on('error', function(e) {
						console.log('请求错误: ' + e.message);
				});
			});
		}else{
			//授权请求URL
			console.log('复制以下地址到浏览器中获取授权：');
			console.log(ACCESS_TOKEN_URL);

			//等待输入授权后的URL
			var readline_get_token_url = READLINE.createInterface({
			  input: process.stdin,
			  output: process.stdout
			});

			readline_get_token_url.question('粘贴授权URL：', function(answer) {
				var token_url=URL.parse(answer.replace('#','?'),true).query;
				ACCESS_TOKEN=token_url.access_token;
				USE_REST_API_URL=USE_REST_API_URL+ACCESS_TOKEN;

				//请求使用REST API,并判断是否授权成功
				HTTPS.get(USE_REST_API_URL, function(res) {
						//console.log(res.statusCode); 
						if (res.statusCode=='200'){
							FS.writeFile(ACCESS_TOKEN_FILE, ACCESS_TOKEN, function (err) {
							if (err) throw err;
							console.log('授权成功！');
							console.log('登陆成功！');
							get_file_list(ROOT_PATH);
							});
						}else{
							console.log('登陆失败！');
						};
					}).on('error', function(e) {
						console.log('请求错误: ' + e.message);
				});
				readline_get_token_url.close();
			});	
		}
	});
}

//获取文件列表
function get_file_list(path){
	console.log('检索文件列表:'+path);
	var url='https://pcs.baidu.com/rest/2.0/pcs/file?method=list&path='+encodeURIComponent(path)+'&access_token='+ACCESS_TOKEN;
	HTTPS.get(url, function(res) {
			//console.log(res.statusCode); 
			if (res.statusCode=='200'){
			 var buffer='';
				res.on("data", function(data){
						buffer+=data;
				});
				
				res.on("end", function(){
						var file_list=JSON.parse(buffer).list;
						//console.log(file_list);
						file_list.forEach(function(file){
							if(file.isdir=='1'){
								get_file_list(file.path);
							}else{
								//本地存储路径
								var filename=file.path.replace(ROOT_PATH,SAVE_PATH);
								FS.exists(filename, function (exists) {
									if(exists){
										//判断文件大小是否一致,不一致则续传
										FS.stat(filename,function(err, stats){
											if(stats.size!=file.size){
												//console.log('续传:'+filename+':'+stats.size+'/'+file.size);
												download_file(file,stats.size);
											}
										});
									}else{
										//下载文件
										download_file(file);
									}
								});
							}
						});
				});
				
			}else{
				console.log('获取列表失败！');
				res.on("data", function(data){
					console.log(JSON.parse(data));
				});
			}
		}).on('error', function(e) {
			console.log('请求错误: ' + e.message);
	});
}


//下载文件,先获取真实的文件url，百度会302一个真实的url用于下载
function download_file(file,indexof){
	if(add_download(file)==false){
		return false;
	}

	console.log('下载文件:'+file.path);
	url='https://d.pcs.baidu.com/rest/2.0/pcs/file?method=download&path='+encodeURIComponent(file.path)+'&access_token='+ACCESS_TOKEN;
	HTTPS.get(url, function(res) {
			//console.log(res.statusCode); 
			if(res.statusCode=='302'){
				_download_file(res.headers.location,file,indexof);
			}else{
				console.log('下载失败');
				res.on("data", function(data){
					console.log(JSON.parse(data));
				});
			}
		}).on('error', function(e) {
			console.log('请求错误: ' + e.message);
	});
}

//下载队列
function add_download(file){
	if((DOWN_LIST.length+1)>DOWN_LIST_NUMBER){
		return false;
	}else{
		DOWN_LIST.forEach(function(dfile){
			if(dfile.fs_id==file.fs_id){//根据PCS文件标识判断是否已经存在相同文件
				return false;
			}
		});
		DOWN_LIST.push(file);
		return true;
	}
}

//显示下载情况
function show_download(){
	var index=0;
	DOWN_LIST.forEach(function(dfile){
		var filename=dfile.path.replace(ROOT_PATH,SAVE_PATH);
		FS.stat(filename,function(err, stats){
			index=index+1;
			if(err){
				throw err;
			}else{
				console.log(index+'.正在下载 '+filename+':'+(stats.size/1048576).toFixed(1)+'M/'+(dfile.size/1048576).toFixed(1)+'M');
			}
		});
	});
	if(DOWN_LIST.length==0){
		console.log('所有任务已经完成！');
	}
}

//删除任务
function delete_download(file){
	var index=0;
	DOWN_LIST.forEach(function(dfile){
		if(dfile.fs_id==file.fs_id){
			DOWN_LIST.splice(index, 1);
			return true;
		}
		index++;
	});
}

//真正下载文件的函数
function _download_file(url,file,indexof){
	console.log(url);
	var filename=file.path.replace(ROOT_PATH,SAVE_PATH);
	mkdirP(PATH.dirname(filename),function (err){

	if (typeof(indexof)=='undefined'){
		indexof=0;
		var fs_options = {
				flags: 'w',
				start : indexof
			};
	}else{
		var fs_options = {
				flags: 'r+',
				start : indexof
			};
	}
	
	var fs_file = FS.createWriteStream(filename,fs_options);
	var url_parse=URL.parse(url);
	var http_options = {
			host: url_parse.host,
			port: url_parse.port,
			path: url_parse.path,
			method: 'GET',
			headers: {
				'RANGE': 'bytes='+indexof+'-'
			}
		};
		HTTP.get(http_options, function(res) {
				//console.log(res.statusCode); 
				if (res.statusCode=='200' || res.statusCode=='206'){
				 var buffer='';
					res.on("data", function(data){
							fs_file.write(data);
					});
					res.on("end", function(){
						fs_file.end();
						delete_download(file);
						console.log('文件下载成功:'+file.path);
					});
				}else if(res.statusCode=='302'){
					fs_file.end();
					_download_file(res.headers.location,file);
				}else{
					fs_file.end();
					delete_download(file);
					console.log('下载失败');
					res.on("data", function(data){
						console.log(JSON.parse(data));
					});
				}
			}).on('error', function(e) {
				console.log('请求错误: ' + e.message);
		});
	});
}

//创建循环目录 /a/b/c/d/....
function mkdirP(p, mode, f, made) {
    if (typeof mode === 'function' || mode === undefined) {
        f = mode;
        mode = 0777 & (~process.umask());
    }
    if (!made) made = null;

    var cb = f || function () {};
    if (typeof mode === 'string') mode = parseInt(mode, 8);
    p = PATH.resolve(p);

    FS.mkdir(p, mode, function (er) {
        if (!er) {
            made = made || p;
            return cb(null, made);
        }
        switch (er.code) {
            case 'ENOENT':
                mkdirP(PATH.dirname(p), mode, function (er, made) {
                    if (er) cb(er, made);
                    else mkdirP(p, mode, cb, made);
                });
                break;
            default:
                FS.stat(p, function (er2, stat) {
                    if (er2 || !stat.isDirectory()) cb(er, made)
                    else cb(null, made);
                });
                break;
        }
    });
}
