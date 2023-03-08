const modulename = 'WebServer:ProviderRedirect';
import logger from '@core/extras/console.js';
import { isValidRedirectPath } from '@core/extras/helpers';
import { verbose } from '@core/globalData';
const { dir, log, logOk, logWarn, logError } = logger(modulename);

//Helper functions
const isUndefined = (x) => { return (typeof x === 'undefined'); };
const returnJustMessage = (ctx, errorTitle, errorMessage) => {
    return ctx.utils.render('login', { template: 'justMessage', errorTitle, errorMessage });
};

/**
 * Generates the provider auth url and redirects the user
 * @param {object} ctx
 */
export default async function ProviderRedirect(ctx) {
    //Sanity check
    if (isUndefined(ctx.params.provider)) {
        return ctx.utils.error(400, 'Invalid Request');
    }
    const provider = ctx.params.provider;

    if (provider !== 'citizenfx') {
        return returnJustMessage(ctx, 'Provider not implemented... yet');
    }

    //Make sure the session is initialized
    ctx.session.startedSocialLogin = Date.now();

    //Save redirection path in session, if any
    //NOTE: technically we don't need to regex validate here, as that will be done on providerCallback
    if(isValidRedirectPath(ctx.query?.r)){
        ctx.session.socialLoginRedirect = ctx.query.r;
    }

    //Generate CitizenFX provider Auth URL
    const callbackUrl = ctx.protocol + '://' + ctx.get('host') + `/auth/citizenfx/callback`;
    try {
        const urlCitizenFX = await globals.adminVault.providers.citizenfx.getAuthURL(
            callbackUrl,
            ctx.session._sessCtx.externalKey,
        );
        return ctx.response.redirect(urlCitizenFX);
    } catch (error) {
        if (verbose) logWarn(`Failed to generate CitizenFX Auth URL with error: ${error.message}`);
        return returnJustMessage(ctx, 'Failed to generate callback URL:', error.message);
    }
};
