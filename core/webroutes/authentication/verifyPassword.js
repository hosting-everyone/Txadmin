const modulename = 'WebServer:AuthVerify';
import logger from '@core/extras/console.js';
import { isValidRedirectPath } from '@core/extras/helpers';
import { verbose } from '@core/globalData';
const { dir, log, logOk, logWarn, logError } = logger(modulename);

//Helper functions
const isUndefined = (x) => { return (typeof x === 'undefined'); };

/**
 * Verify login
 * @param {object} ctx
 */
export default async function AuthVerify(ctx) {
    if (isUndefined(ctx.request.body.username) || isUndefined(ctx.request.body.password)) {
        return ctx.response.redirect('/');
    }
    const renderData = {
        template: 'normal',
        message: null,
        citizenfxDisabled: !globals.adminVault.providers.citizenfx.ready,
    };

    try {
        //Checking admin
        const admin = globals.adminVault.getAdminByName(ctx.request.body.username);
        if (!admin) {
            logWarn(`Wrong username for from: ${ctx.ip}`);
            renderData.message = 'Wrong Username!';
            return ctx.utils.render('login', renderData);
        }
        if (!VerifyPasswordHash(ctx.request.body.password.trim(), admin.password_hash)) {
            logWarn(`Wrong password for from: ${ctx.ip}`);
            renderData.message = 'Wrong Password!';
            return ctx.utils.render('login', renderData);
        }

        //Setting up session
        const providerWithPicture = Object.values(admin.providers).find((provider) => provider.data && provider.data.picture);
        ctx.session.auth = {
            username: admin.name,
            picture: (providerWithPicture) ? providerWithPicture.data.picture : undefined,
            password_hash: admin.password_hash,
            expires_at: false,
            csrfToken: globals.adminVault.genCsrfToken(),
        };

        ctx.utils.logAction(`logged in from ${ctx.ip} via password`);
        globals.databus.txStatsData.login.origins[ctx.txVars.hostType]++;
        globals.databus.txStatsData.login.methods.password++;
    } catch (error) {
        logWarn(`Failed to authenticate ${ctx.request.body.username} with error: ${error.message}`);
        if (verbose) dir(error);
        renderData.message = 'Error autenticating admin.';
        return ctx.utils.render('login', renderData);
    }

    const redirectPath = (isValidRedirectPath(ctx.query?.r)) ? ctx.query.r : '/';
    return ctx.response.redirect(redirectPath);
};
