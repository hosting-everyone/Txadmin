//Requires
const modulename = 'WebServer:PlayerActions';
const humanizeDuration = require('humanize-duration');
const xss = require('../../extras/xss')();
const { dir, log, logOk, logWarn, logError } = require('../../extras/console')(modulename);

//Helper functions
const now = () => { return Math.round(Date.now() / 1000); };
const anyUndefined = (...args) => { return [...args].some((x) => (typeof x === 'undefined')); };
const escape = (x) => {return x.replace(/"/g, '\uff02');};
const formatCommand = (cmd, ...params) => {
    return `${cmd} "` + [...params].map((c) => c.toString()).map(escape).join('" "') + '"';
};
function ensurePermission(ctx, perm) {
    if (ctx.utils.checkPermission(perm, modulename)) {
        return true;
    } else {
        ctx.send({
            type: 'danger',
            message: 'You don\'t have permission to execute this action.',
        });
        return false;
    }
}
function sendAlertOutput(ctx, toResp, header = 'Output:') {
    toResp = (toResp.length) ? xss(toResp) : 'no output';
    return ctx.send({
        type: 'warning',
        message: `<b>${header}</b><br> <pre>${toResp}</pre>`,
    });
}


/**
 * Returns the output page containing the bans experiment
 * @param {object} ctx
 */
module.exports = async function PlayerActions(ctx) {
    //Sanity check
    if (anyUndefined(ctx.params.action)) {
        return ctx.utils.error(400, 'Invalid Request');
    }
    let action = ctx.params.action;

    //Delegate to the specific action handler
    if (action === 'save_note') {
        return await handleSaveNote(ctx);
    } else if (action === 'message') {
        return await handleMessage(ctx);
    } else if (action === 'kick') {
        return await handleKick(ctx);
    } else if (action === 'warn') {
        return await handleWarning(ctx);
    } else if (action === 'ban') {
        return await handleBan(ctx);
    } else if (action === 'whitelist') {
        return await handleWhitelist(ctx);
    } else if (action === 'revoke_action') {
        return await handleRevokeAction(ctx);
    } else {
        return ctx.send({
            type: 'danger',
            message: 'Unknown action.',
        });
    }
};


//================================================================
/**
 * Handle Save Note
 *
 * NOTE: open to all admins
 *
 * @param {object} ctx
 */
async function handleSaveNote(ctx) {
    //Checking request
    if (anyUndefined(
        ctx.request.body,
        ctx.request.body.note,
        ctx.request.body.license,
    )) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    let license = ctx.request.body.license.trim();
    let note = ctx.request.body.note.trim();

    try {
        let success = await globals.playerController.setPlayerNote(license, note, ctx.session.auth.username);
        if (success) {
            return ctx.send({
                type: 'success',
                message: 'Saved!',
            });
        } else {
            return ctx.send({
                type: 'danger',
                message: 'failed to save note.',
            });
        }
    } catch (error) {
        return ctx.send({
            type: 'danger',
            message: `Failed to save with error: ${error.message}`,
        });
    }
}


//================================================================
/**
 * Handle Send Message (admin dm)
 * @param {object} ctx
 */
async function handleMessage(ctx) {
    //Checking request
    if (anyUndefined(
        ctx.request.body,
        ctx.request.body.id,
        ctx.request.body.message,
    )) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    let id = ctx.request.body.id;
    let message = ctx.request.body.message.trim();

    //Check permissions
    if (!ensurePermission(ctx, 'players.message')) return false;

    //Prepare and send command
    ctx.utils.logAction(`DM to #${id}: ${message}`);
    let cmd = formatCommand('txaSendDM', id, ctx.session.auth.username, message);
    let toResp = await globals.fxRunner.srvCmdBuffer(cmd);
    return sendAlertOutput(ctx, toResp);
}


//================================================================
/**
 * Handle Kick Player
 * @param {object} ctx
 */
async function handleKick(ctx) {
    //Checking request
    if (anyUndefined(
        ctx.request.body,
        ctx.request.body.id,
        ctx.request.body.reason,
    )) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    const id = ctx.request.body.id;
    const reason = ctx.request.body.reason.trim() || 'no reason provided';

    //Check permissions
    if (!ensurePermission(ctx, 'players.kick')) return false;

    //Prepare and send command
    ctx.utils.logAction(`Kicked #${id}: ${reason}`);
    const msg = `[txAdmin] (${xss(ctx.session.auth.username)}) Kick reason: ${xss(reason)}`;
    const cmd = formatCommand('txaKickID', id, msg);
    const toResp = await globals.fxRunner.srvCmdBuffer(cmd);

    // Dispatch `txAdmin:events:playerKicked`
    globals.fxRunner.sendEvent('playerKicked', {
        target: id,
        author: ctx.session.auth.username,
        reason,
    });

    return sendAlertOutput(ctx, toResp);
}


//================================================================
/**
 * Handle Send Warning
 * @param {object} ctx
 */
async function handleWarning(ctx) {
    //Checking request
    if (anyUndefined(
        ctx.request.body,
        ctx.request.body.id,
        ctx.request.body.reason,
    )) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    let id = parseInt(ctx.request.body.id);
    if (Number.isNaN(id)) return ctx.send({type: 'danger', message: 'Invalid ID.'});
    let reason = ctx.request.body.reason.trim();

    //Check permissions
    if (!ensurePermission(ctx, 'players.warn')) return false;

    //Register action (and checks if player is online)
    let actionId;
    try {
        actionId = await globals.playerController.registerAction(id, 'warn', ctx.session.auth.username, reason);
    } catch (error) {
        return ctx.send({type: 'danger', message: `<b>Error:</b> ${error.message}`});
    }

    //Prepare and send command
    ctx.utils.logAction(`Warned #${id}: ${reason}`);
    let cmd = formatCommand(
        'txaWarnID',
        id,
        ctx.session.auth.username,
        reason,
        globals.translator.t('nui_warning.title'),
        globals.translator.t('nui_warning.warned_by'),
        globals.translator.t('nui_warning.instruction'),
    );
    let toResp = await globals.fxRunner.srvCmdBuffer(cmd);

    // Dispatch `txAdmin:events:playerWarned`
    globals.fxRunner.sendEvent('playerWarned', {
        target: id,
        author: ctx.session.auth.username,
        reason,
        actionId,
    });
    return sendAlertOutput(ctx, toResp);
}


//================================================================
/**
 * Handle Banning command
 * @param {object} ctx
 */
async function handleBan(ctx) {
    //Checking request & identifiers
    if (
        anyUndefined(
            ctx.request.body,
            ctx.request.body.duration,
            ctx.request.body.reference,
            ctx.request.body.reason,
        )
    ) {
        return ctx.send({type: 'danger', message: 'Missing parameters or invalid identifiers.'});
    }
    let reference = ctx.request.body.reference;
    const inputDuration = ctx.request.body.duration.trim();
    const reason = ctx.request.body.reason.trim();

    //Converting ID to int
    if (typeof reference === 'string') {
        let intID = parseInt(reference);
        if (isNaN(intID)) {
            return ctx.send({type: 'danger', message: 'You must send at least one identifier.'});
        } else {
            reference = intID;
        }
    }

    //Calculating expiration
    let expiration;
    let duration;
    if (inputDuration === 'permanent') {
        expiration = false;
    } else {
        const [ multiplierInput, unit ] = inputDuration.split(/\s+/);
        const multiplier = parseInt(multiplierInput);
        if (isNaN(multiplier) || multiplier < 1) {
            return ctx.send({type: 'danger', message: 'The duration multiplier must be a number above 1.'});
        }

        if (unit.startsWith('hour')) {
            duration = multiplier * 3600;
        } else if (unit.startsWith('day')) {
            duration = multiplier * 86400;
        } else if (unit.startsWith('week')) {
            duration = multiplier * 604800;
        } else if (unit.startsWith('month')) {
            duration = multiplier * 2592000; //30 days
        } else {
            return ctx.send({type: 'danger', message: 'Invalid ban duration. Supported units: hours, days, weeks, months'});
        }
        expiration = now() + duration;
    }

    //Check permissions
    if (!ensurePermission(ctx, 'players.ban')) return false;

    //Register action (and checks if player is online)
    let actionId;
    try {
        actionId = await globals.playerController.registerAction(reference, 'ban', ctx.session.auth.username, reason, expiration);
    } catch (error) {
        return ctx.send({type: 'danger', message: `<b>Error:</b> ${error.message}`});
    }

    //Prepare and send command
    let msg;
    const tOptions = {
        author: xss(ctx.session.auth.username),
        reason: xss(reason),
    };
    if (expiration !== false) {
        const humanizeOptions = {
            language: globals.translator.t('$meta.humanizer_language'),
            round: true,
            units: ['d', 'h'],
        };
        tOptions.expiration = humanizeDuration((duration) * 1000, humanizeOptions);
        msg = '[txAdmin] ' + globals.translator.t('ban_messages.kick_temporary', tOptions);
    } else {
        msg = '[txAdmin] ' + globals.translator.t('ban_messages.kick_permanent', tOptions);
    }

    let cmd;
    if (Array.isArray(reference)) {
        cmd = formatCommand('txaDropIdentifiers', reference.join(';'), msg);
        ctx.utils.logAction(`Banned <${reference.join(';')}>: ${reason}`);
    } else if (Number.isInteger(reference)) {
        cmd = formatCommand('txaKickID', reference, msg);
        ctx.utils.logAction(`Banned #${reference}: ${reason}`);
    } else {
        return ctx.send({type: 'danger', message: '<b>Error:</b> unknown reference type'});
    }

    // Dispatch `txAdmin:events:playerBanned`
    globals.fxRunner.sendEvent('playerBanned', {
        author: ctx.session.auth.username,
        reason,
        actionId,
        target: reference,
    });

    const toResp = await globals.fxRunner.srvCmdBuffer(cmd);
    return sendAlertOutput(ctx, toResp, 'Identifiers banned!<br>Kicking players:');
}


//================================================================
/**
 * Handle Whitelist Action
 * @param {object} ctx
 */
async function handleWhitelist(ctx) {
    //Checking request
    if (anyUndefined(ctx.request.body.reference)) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    let reference = ctx.request.body.reference.trim();

    //Check permissions
    if (!ensurePermission(ctx, 'players.whitelist')) return false;

    //Whitelist reference
    let actionId;
    try {
        actionId = await globals.playerController.approveWhitelist(reference, ctx.session.auth.username);
    } catch (error) {
        return ctx.send({type: 'danger', message: `<b>Error:</b> ${error.message}`});
    }

    // Dispatch `txAdmin:events:playerWhitelisted`
    globals.fxRunner.sendEvent('playerWhitelisted', {
        target: reference,
        author: ctx.session.auth.username,
        actionId,
    });

    ctx.utils.logAction(`Whitelisted ${reference}`);
    return ctx.send({refresh: true});
}


//================================================================
/**
 * Handle Revoke Action
 * @param {object} ctx
 */
async function handleRevokeAction(ctx) {
    //Checking request
    if (anyUndefined(ctx.request.body.action_id)) {
        return ctx.send({type: 'danger', message: 'Invalid request.'});
    }
    let action_id = ctx.request.body.action_id.trim();

    //Check permissions
    let perms = [];
    if (ensurePermission(ctx, 'players.ban')) perms.push('ban');
    if (ensurePermission(ctx, 'players.warn')) perms.push('warn');
    if (ensurePermission(ctx, 'players.whitelist')) perms.push('whitelist');

    //Revoke action
    try {
        let errorMsg = await globals.playerController.revokeAction(action_id, ctx.session.auth.username, perms);
        if (errorMsg !== null) {
            return ctx.send({type: 'danger', message: `<b>Error:</b> ${errorMsg}`});
        }
    } catch (error) {
        return ctx.send({type: 'danger', message: `<b>Error:</b> ${error.message}`});
    }
    ctx.utils.logAction(`Revoked ${action_id}`);
    return ctx.send({refresh: true});
}
