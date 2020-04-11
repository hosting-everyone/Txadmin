//Requires
const modulename = 'WebCtxUtils';
const fs = require('fs-extra');
const path = require('path');
const sqrl = require("squirrelly");
const helpers = require('../../extras/helpers');
const { dir, log, logOk, logWarn, logError} = require('../../extras/console')(modulename);

//Helper functions
const isUndefined = (x) => { return (typeof x === 'undefined') };
const getRenderErrorText = (view, error, data) => {
    logError(`Error rendering ${view}.`);
    if(GlobalData.verbose) dir(error)
    out = `<pre>\n`;
    out += `Error rendering '${view}'.\n`;
    out += `Message: ${error.message}\n`;
    out += `The data provided was:\n`;
    out += `================\n`;
    out += JSON.stringify(data, null, 2);
    out += `</pre>\n`;
    return out;
}
const getWebViewPath = (view) => {
    if(view.includes('..')) throw new Error('Path Traversal?');
    return path.join(GlobalData.txAdminResourcePath, 'web/', view+'.html');
}

//Squirrelly Filters
sqrl.defineFilter("isSelected", (x)=>{
    return (x==='true')? 'selected' : '';
});
sqrl.defineFilter("isActive", (x)=>{
    return (x==='true')? 'active' : '';
});
sqrl.defineFilter("tShow", (x)=>{
    return (x)? `show ${x}` : '';
});
sqrl.defineFilter("isDisabled", (x)=>{
    return (x==='true')? 'disabled' : '';
});
sqrl.defineFilter("n2br", (x)=>{
    return x.replace(/(\r|\n)+/m, '<br>');
});
sqrl.defineFilter("undef", (x)=>{
    return (isUndefined(x) || x == 'undefined')? '' : x;
});


//================================================================
/**
 * Renders the master page including header and footer
 * @param {string} view
 * @param {string} data
 */
async function renderMasterView(view, reqSess, data){
    if(isUndefined(data)) data = {};
    data.headerTitle = (!isUndefined(data.headerTitle))? `${data.headerTitle} - txAdmin` : 'txAdmin';
    data.txAdminVersion = GlobalData.txAdminVersion;
    data.fxserverVersion = GlobalData.fxServerVersion;
    data.adminUsername = (reqSess && reqSess.auth && reqSess.auth.username)? reqSess.auth.username : 'unknown user';
    data.profilePicture = (reqSess && reqSess.auth && reqSess.auth.picture)? reqSess.auth.picture : 'img/default_avatar.png';
    data.isTempPassword = (reqSess && reqSess.auth && reqSess.auth.isTempPassword);
    data.isLinux = (GlobalData.osType == 'Linux');

    let out;
    try {
        const [rawHeader, rawFooter, rawView] = await Promise.all([
            fs.readFile(getWebViewPath('basic/header'), 'utf8'),
            fs.readFile(getWebViewPath('basic/footer'), 'utf8'),
            fs.readFile(getWebViewPath(view), 'utf8')
        ]);
        sqrl.definePartial("header", rawHeader);
        sqrl.definePartial("footer", rawFooter);
        out = sqrl.Render(rawView, data);
    } catch (error) {
        out = getRenderErrorText(view, error, data);
    }

    return out;
}


//================================================================
/**
 * Renders the login page.
 * @param {string} message
 */
async function renderLoginView(data){
    if(isUndefined(data)) data = {};
    data.headerTitle = data.headerTitle || 'Login';
    data.isMatrix = (Math.random() <= 0.05);
    data.ascii = helpers.txAdminASCII();
    data.message = data.message || '';
    data.template = data.template || 'normal';
    // data.template = 'noMaster';
    // data.template = 'callback';
    // data.template = 'normal';
    // data.template = 'justMessage';
    data.serverProfile = globals.info.serverProfile;
    data.txAdminVersion = GlobalData.txAdminVersion;
    data.fxserverVersion = GlobalData.fxServerVersion;

    let out;
    try {
        let rawView = await fs.readFile(getWebViewPath(`basic/login`), 'utf8');
        out = sqrl.Render(rawView, data);
    } catch (error) {
        out = getRenderErrorText('Login', error, data);
    }

    return out;
}


//================================================================
/**
 * Renders a solo view.
 * NOTE: not used
 * @param {string} view
 * @param {string} data
 */
async function renderSoloView(view, data){
    if(isUndefined(data)) data = {};
    let out;
    try {
        let rawView = await fs.readFile(getWebViewPath(view), 'utf8');
        out = sqrl.Render(rawView, data);
    } catch (error) {
        out = getRenderErrorText(view, error, data);
    }

    return out;
}



//================================================================
/**
 * Append data to the log file
 * FIXME: edit consistency of this function and apply to all endpoints
 * @param {object} ctx
 * @param {string} data
 */
function appendLog(ctx, data){
    log(`Executing "${data}"`);
    globals.logger.append(`[${ctx.ip}][${ctx.session.auth.username}] ${data}`);
}


//================================================================
/**
 * Check for a permission
 * @param {object} ctx
 * @param {string} perm
 * @param {string} fromCtx
 * @param {boolean} printWarn
 */
function checkPermission(ctx, perm, fromCtx, printWarn = true){
    try {
        if(
            ctx.session.auth.master === true ||
            ctx.session.auth.permissions.includes('all_permissions') ||
            ctx.session.auth.permissions.includes(perm)
        ){
            return true;
        }else{
            if(GlobalData.verbose && printWarn) logWarn(`[${ctx.ip}][${ctx.session.auth.username}] Permission '${perm}' denied.`, fromCtx);
            return false;
        }
    } catch (error) {
        if(GlobalData.verbose && typeof fromCtx === 'string') logWarn(`Error validating permission '${perm}' denied.`, fromCtx);
        return false;
    }
}

//================================================================
//================================================================
//================================================================
module.exports = async function WebCtxUtils(ctx, next){
    ctx.send = (data) => { ctx.body = data; };
    ctx.utils = {};
    ctx.utils.render = async (view, viewData) => {
        //TODO: fix this atrocity
        let soloViews = ['adminManager-editModal', 'basic/404'];
        if(view == 'login'){
            ctx.body = await renderLoginView(viewData);
        }else if(soloViews.includes(view)){
            ctx.body = await renderSoloView(view, viewData);
        }else{
            ctx.body = await renderMasterView(view, ctx.session, viewData);
        }
        ctx.type = 'text/html';
    }
    ctx.utils.error = (httpStatus = 500, message = 'unknown error') => {
        ctx.status = httpStatus;
        ctx.body = {
            status: 'error', 
            code: parseInt(httpStatus),
            message
        };
    }

    ctx.utils.appendLog = async (data) => {
        return appendLog(ctx, data);
    }
    ctx.utils.checkPermission = (perm, fromCtx, printWarn) => {
        return checkPermission(ctx, perm, fromCtx, printWarn);
    }

    return next();
}
