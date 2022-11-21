const modulename = 'WebServer:AdvancedGet';
import logger from '@core/extras/console.js';
import { verbose } from '@core/globalData';
const { dir, log, logOk, logWarn, logError } = logger(modulename);


/**
 * Returns the output page containing the server.cfg
 * @param {object} ctx
 */
export default async function AdvancedGet(ctx) {
    //Check permissions
    if (!ctx.utils.hasPermission('all_permisisons')) {
        return ctx.utils.render('main/message', {message: 'You don\'t have permission to view this page.'});
    }

    return ctx.utils.render('main/advanced', {
        headerTitle: 'Advanced',
        verbosityEnabled: verbose,
    });
};
