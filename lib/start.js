/**
 * Created by jianlin.zjl on 15-4-16.
 */
var path = require('path');
var RT = require('./rt');
var util = require('util');
var fs = require('fs');
var koa = require('koa');
var logger = require('koa-morgan').middleware;
var http = require('http');
var serverIndex = require('koa-serve-index');
var rimraf = require('ginit').rimraf;
var os = require('os');
var open = require('open');
var serve = require('koa-static');
var url = require('url');
var webpackMiddleware = require("koa-webpack-dev-middleware");
var ctoolHtmlMiddleware = require('ctool-html-compile').middleware;
var webpack = require('webpack');
var cwdPath = process.cwd();
RT.env = 'start'; //
var config = RT.config;
var htmlList = require('html-list-middleware');
var lib = require('./index');
lib.configPathExists();
module.exports = function(option,cb){
    var options = util._extend({
        base: cwdPath,
        //port: process.env.PORT || 3000,
        open: true,
        notStart: false,
        tmpDir: os.tmpdir(),
        srcBase: 'src',
        debug: false,
        isHot: true,
        isDataProxy: true,
        isWeinre: false,
    }, config.options || {});
    options = util._extend(options,option || {});
    options.port = options.port || process.env.PORT || 3000;
    RT.args = options.args;
    var tmpPath = options.tmpDir;
    var app = koa();
//清除临时文件
 /*   process.nextTick(function () {
        rimraf.sync(tmpPath);
    });
*/
    if (options.isDataProxy) {
        app.use(require('koa-data-proxy')(options.dataProxy || {}));
    }

//favicon
//app.use(favicon(path.join(__dirname ,'../favicon.ico')));


//资源文件列表
    app.use(serverIndex(
        options.base, {'icons': false}
    ));
//index.html显示 html list
    app.use(htmlList({
        //忽略index
        handData: function (arr) {
            var newArr = [];
            arr.forEach(function (item) {
                newArr.push(item.replace(/[\\\/]index\.html$/,function () {
                     return '.html'
                 }))
            });
            return newArr;
        }
    }));


//请求资源log
    app.use(logger('dev'));

    var proxyObj = {
        proxyName: '/rt_pac',
        port: options.port,
        host: lib.getIPAddress(),
        rules: options.proxyRules || []
    };

//pac 代理
    if(options.isProxy){
        var pacMiddleware = require('koa-pac-middleware');
        app.use(pacMiddleware(proxyObj));
    }

    var ip = lib.getIPAddress();
//处理 html
    app.use(ctoolHtmlMiddleware(cwdPath, {
        name: config.name || '',
        group: config.group || '',
        version: config.version || '',
        isTms: false,
        transform:  function(content){
            var reg = '([\'"]+)\\s?\\/'+options.srcBase+'\\/';
            content = content.replace(/(['"=\s])http(s)?:/g,function(world,$1){
                return $1
            });
            content = content.replace(new RegExp(reg,'g'),function(world,$1){
                return $1 + '//'+ip+':'+options.port+'/'+options.srcBase+'/';
            }).replace(/(['"])([^'"]*)\/bower_components\//g,function(word,$1,$2){
                return $1+'//'+ip+':'+options.port+($2 ||'')+'/bower_components/';
            }).replace(/(['"])([^'"]*)\/node_modules\//g,function(word,$1,$2){
                return $1+'//'+ip+':'+options.port+($2 ||'')+'/node_modules/';
            });
            return content

        }
    }));
    RT.options = options; //区别config.options;

//添加其他 app
    addServer();
//代理


//位置在最后
    var webpackOption = lib.getWebpackConfig(RT);
    webpackOption.then(function (data,a) {
        var compiler = webpack(data);
        app.use(webpackMiddleware(compiler,{
            noInfo: true
        }));
// Step 3: Attach the hot middleware to the compiler & the server
        if(options.isHot){
            app.use(require("koa-webpack-hot-middleware")(compiler, {
                log: console.log, path: '/__webpack_hmr', heartbeat: 10 * 1000
            }));
        }
      //  app.use(serve(tmpPath));
        app.use(serve(cwdPath));
        start();
    }).catch(function (e) {
        console.log(e)
    });

    var server;
    function start() {
        server = app.listen(options.port, function () {
            if (options.open === true) {
                open('http://127.0.0.1:' + options.port + '/index.html');
            } else if (typeof options.open === 'object') {
                options.open.target = options.open.target || target;
                options.open.appName = options.open.appName || null;
                options.open.callback = options.open.callback || function () {
                    };
                open(options.open.target, options.open.appName, options.open.callback);
            } else if (typeof options.open === 'string') {
                open('http://127.0.0.1:' + options.port +options.open);
            }
            console.log('start listening on port ' + server.address().port);
            cb && cb();
        });
    }

    function addServer() {
        if(util.isFunction(config.addServer)){
            config.addServer(RT,app)
        }
    }

//捕获异常
    process.on('uncaughtException', function(err) {
        console.log('uncaughtException: ' + err);
        server && server.on('request', function (req, res) {
            // Let http server set `Connection: close` header, and close the current request socket.
            req.shouldKeepAlive = false;
            res.shouldKeepAlive = false;
            if (!res._header) {
                res.setHeader('Connection', 'close');
            }
        });
    });

};


