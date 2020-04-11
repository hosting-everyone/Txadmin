//Requires
const modulename = 'WebServer:GetStatus';
const os = require('os');
const clone = require('clone');
const xss = require('../extras/xss')();
const { dir, log, logOk, logWarn, logError} = require('../extras/console')(modulename);


/**
 * Getter for all the log/server/process data
 * @param {object} ctx
 */
module.exports = async function GetStatus(ctx) {
    return ctx.send({
        meta: prepareMetaData(),
        host: prepareHostData(),
        status: prepareServerStatus(),
        players: preparePlayersData()
    })
};


//==============================================================
/**
 * Returns the fxserver's data
 */
function prepareServerStatus() {
    let dataServer = clone(globals.monitor.statusServer);
    let fxServerHitches = clone(globals.monitor.globalCounters.hitches);

    //processing hitches
    let now = (Date.now() / 1000).toFixed();
    let hitchTimeSum = 0;
    fxServerHitches.forEach((hitch, key) => {
        if (now - hitch.ts < 60) {
            hitchTimeSum += hitch.hitchTime;
        } else {
            delete (fxServerHitches[key]);
        }
    });

    //preparing hitch output string
    let hitches;
    if (hitchTimeSum > 5000) {
        let secs = (hitchTimeSum / 1000).toFixed();
        let pct = ((secs / 60) * 100).toFixed();
        hitches = `${secs}s/min (${pct}%)`;
    } else {
        hitches = hitchTimeSum + 'ms/min';
    }

    //preparing the rest of the strings
    let statusClass = (dataServer.online) ? 'success' : 'danger';
    let statusText = (dataServer.online) ? 'ONLINE' : 'OFFLINE';
    let ping = (dataServer.online && typeof dataServer.ping !== 'undefined') ? dataServer.ping + 'ms' : '--';
    let players = (dataServer.online && typeof dataServer.players !== 'undefined') ? dataServer.players.length : '--';

    let logFileSize = (
        globals.fxRunner &&
        globals.fxRunner.consoleBuffer &&
        globals.fxRunner.consoleBuffer.logFileSize
    )? globals.fxRunner.consoleBuffer.logFileSize : '--';

    let injectedResources = (
        globals.fxRunner &&
        globals.fxRunner.extResources &&
        Array.isArray(globals.fxRunner.extResources)
    )? globals.fxRunner.extResources.length : '--';

    let out = `<strong>Status: <span class="badge badge-${statusClass}">${statusText}</span> </strong><br>
                <strong>Ping (localhost):</strong> ${ping}<br>
                <strong>Players:</strong> ${players}<br>
                <strong>Hitch Time:</strong> ${hitches}<br>
                <strong>Log Size:</strong> ${logFileSize}`;
                // <strong>Resources Injected:</strong> ${injectedResources}
    return out;
}


//==============================================================
/**
 * Returns the host's usage
 */
function prepareHostData() {
    let giga = 1024 * 1024 * 1024;

    try {
        //processing host data
        let memFree = (os.freemem() / giga).toFixed(2);
        let memTotal = (os.totalmem() / giga).toFixed(2);
        let memUsed = (memTotal - memFree).toFixed(2);;
        let memUsage = ((memUsed / memTotal) * 100).toFixed(0);
        let cpus = os.cpus();
        let cpuStatus = globals.monitor.cpuStatusProvider.getUsageStats();
        let cpuUsage = cpuStatus.last10 || cpuStatus.full;

        //returning output output
        return {
            memory: {
                pct: memUsage,
                text: `${memUsage}% (${memUsed}/${memTotal} GB)`
            },
            cpu:{
                pct: cpuUsage,
                text: `${cpuUsage}% of ${cpus.length}x ${cpus[0].speed} MHz`
            }
        }

    } catch (error) {
        if (GlobalData.verbose) {
            logError('Failed to execute prepareHostData()');
            dir(error);
        }
        return {
            memory: {
                pct: 0,
                text: `error`
            },
            cpu:{
                pct: 0,
                text: `error`
            }
        }
    }
}


//==============================================================
/**
 * Returns the html playerlist
 */
function preparePlayersData() {
    // return globals.testPlayers;
    let dataServer = clone(globals.monitor.statusServer);
    return dataServer.players;
}


//==============================================================
/**
 * Returns the page metadata (title and icon)
 */
function prepareMetaData() {
    let dataServer = clone(globals.monitor.statusServer);
    return {
        favicon: (dataServer.online) ? 'favicon_on' : 'favicon_off',
        title: (dataServer.online) ? `(${dataServer.players.length}) txAdmin` : 'txAdmin'
    };
}
