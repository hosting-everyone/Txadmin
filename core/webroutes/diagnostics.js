const modulename = 'WebServer:Diagnostics';
import os from 'node:os';
import bytes from 'bytes';
import humanizeDuration from 'humanize-duration';
import logger from '@core/extras/console.js';
import * as helpers from '@core/extras/helpers';
import Cache from '../extras/dataCache';
import got from '@core/extras/got.js';
import getOsDistro from '@core/extras/getOsDistro.js';
import pidUsageTree from '@core/extras/pidUsageTree.js';
import { verbose, txEnv } from '@core/globalData';
const { dir, log, logOk, logWarn, logError } = logger(modulename);

const cache = new Cache(5);


/**
 * Returns the output page containing the full report
 * @param {object} ctx
 */
export default async function Diagnostics(ctx) {
    const cachedData = cache.get();
    if (cachedData !== false) {
        cachedData.message = 'This page was cached in the last 5 seconds';
        return ctx.utils.render('main/diagnostics', cachedData);
    }

    const timeStart = Date.now();
    const data = {
        headerTitle: 'Diagnostics',
        message: '',
    };
    [data.host, data.txadmin, data.fxserver, data.proccesses] = await Promise.all([
        getHostData(),
        gettxAdminData(),
        getFXServerData(),
        getProcessesData(),
    ]);

    const timeElapsed = Date.now() - timeStart;
    data.message = `Executed in ${timeElapsed} ms`;

    cache.set(data);
    return ctx.utils.render('main/diagnostics', data);
};


//================================================================
/**
 * Gets the Processes Data.
 * TODO: get process name with wmic
 *       wmic PROCESS get "Name,ParentProcessId,ProcessId,CommandLine,CreationDate,UserModeTime,WorkingSetSize"
 */
async function getProcessesData() {
    const procList = [];
    try {
        const processes = await pidUsageTree(process.pid);

        //NOTE: Cleaning invalid proccesses that might show up in Linux
        Object.keys(processes).forEach((pid) => {
            if (processes[pid] === null) delete processes[pid];
        });

        //Foreach PID
        Object.keys(processes).forEach((pid) => {
            const curr = processes[pid];

            //Define name and order
            let procName;
            let order = process.timestamp || 1;
            if (pid == process.pid) {
                procName = 'txAdmin (inside FXserver)';
                order = 0;
            } else if (curr.memory <= 10 * 1024 * 1024) {
                procName = 'FXServer MiniDump';
            } else {
                procName = 'FXServer';
            }

            procList.push({
                pid: pid,
                ppid: (curr.ppid == process.pid) ? 'txAdmin' : curr.ppid,
                name: procName,
                cpu: (curr.cpu).toFixed(2) + '%',
                memory: bytes(curr.memory),
                order: order,
            });
        });
    } catch (error) {
        logError('Error getting processes tree usage data.');
        if (verbose) dir(error);
    }

    //Sort procList array
    procList.sort(( a, b ) => {
        if ( a.order < b.order )  return -1;
        if ( a.order > b.order ) return 1;
        return 0;
    });

    return procList;
}


//================================================================
/**
 * Gets the FXServer Data.
 */
async function getFXServerData() {
    //Sanity Check
    if (globals.fxRunner.fxChild === null || globals.fxRunner.fxServerHost === null) {
        return {error: 'Server Offline'};
    }

    //Preparing request
    const requestOptions = {
        url: `http://${globals.fxRunner.fxServerHost}/info.json`,
        maxRedirects: 0,
        timeout: globals.healthMonitor.hardConfigs.timeout,
        retry: {limit: 0},
    };

    //Making HTTP Request
    let infoData;
    try {
        infoData = await got.get(requestOptions).json();
    } catch (error) {
        logWarn('Failed to get FXServer information.');
        if (verbose) dir(error);
        return {error: 'Failed to retrieve FXServer data. <br>The server must be online for this operation. <br>Check the terminal for more information (if verbosity is enabled)'};
    }

    //Helper function
    const getBuild = (ver) => {
        try {
            const regex = /v1\.0\.0\.(\d{4,5})\s*/;
            const res = regex.exec(ver);
            return parseInt(res[1]);
        } catch (error) {
            return 0;
        }
    };

    //Processing result
    try {
        return {
            error: false,
            statusColor: 'success',
            status: ' ONLINE ',
            version: infoData.server,
            versionMismatch: (getBuild(infoData.server) !== txEnv.fxServerVersion),
            resources: infoData.resources.length,
            onesync: (infoData.vars && infoData.vars.onesync_enabled === 'true') ? 'enabled' : 'disabled',
            maxClients: (infoData.vars && infoData.vars.sv_maxClients) ? infoData.vars.sv_maxClients : '--',
            txAdminVersion: (infoData.vars && infoData.vars['txAdmin-version']) ? infoData.vars['txAdmin-version'] : '--',
        };
    } catch (error) {
        logWarn('Failed to process FXServer information.');
        if (verbose) dir(error);
        return {error: 'Failed to process FXServer data. <br>Check the terminal for more information (if verbosity is enabled)'};
    }
}


//================================================================
/**
 * Gets the Host Data.
 */
async function getHostData() {
    try {
        const userInfo = os.userInfo();
        const hostData = {
            nodeVersion: process.version,
            osDistro: await getOsDistro(),
            username: `${userInfo.username}`,
            memory: 'not available',
            cpus: 'not available',
            clockWarning: '',
            error: false,
        };

        const stats = globals.healthMonitor.hostStats;
        if (stats) {
            hostData.memory = `${stats.memory.usage}% (${stats.memory.used.toFixed(2)}/${stats.memory.total.toFixed(2)} GB)`;
            hostData.cpus = `${stats.cpu.usage}% of ${stats.cpu.count}x ${stats.cpu.speed} MHz`;
            if (stats.cpu.count < 8) {
                if (stats.cpu.speed <= 2400) {
                    hostData.clockWarning = '<span class="badge badge-danger"> VERY SLOW! </span>';
                } else if (stats.cpu.speed < 3000) {
                    hostData.clockWarning = '<span class="badge badge-warning"> SLOW </span>';
                }
            }
        }
        return hostData;
    } catch (error) {
        logError('Error getting Host data');
        if (verbose) dir(error);
        return {error: 'Failed to retrieve host data. <br>Check the terminal for more information (if verbosity is enabled)'};
    }
}


//================================================================
/**
 * Gets txAdmin Data
 */
async function gettxAdminData() {
    const humanizeOptions = {
        round: true,
        units: ['d', 'h', 'm'],
    };

    const playerDbConfigs = globals.playerDatabase.config;
    const httpCounter = globals.databus.txStatsData.httpCounter;
    return {
        //Stats
        uptime: humanizeDuration(process.uptime() * 1000, humanizeOptions),
        banlistEnabled: playerDbConfigs.onJoinCheckBan.toString(),
        whitelistEnabled: playerDbConfigs.onJoinCheckWhitelist.toString(),
        httpCounterLog: httpCounter.log.join(', ') || '--',
        httpCounterMax: httpCounter.max || '--',
        monitorRestarts: {
            close: globals.databus.txStatsData.monitorStats.restartReasons.close,
            heartBeat: globals.databus.txStatsData.monitorStats.restartReasons.heartBeat,
            healthCheck: globals.databus.txStatsData.monitorStats.restartReasons.healthCheck,
        },
        hbFD3Fails: globals.databus.txStatsData.monitorStats.heartBeatStats.fd3Failed,
        hbHTTPFails: globals.databus.txStatsData.monitorStats.heartBeatStats.httpFailed,
        hbBootSeconds: globals.databus.txStatsData.monitorStats.bootSeconds.join(', ') || '--',
        freezeSeconds: globals.databus.txStatsData.monitorStats.freezeSeconds.join(', ') || '--',
        koaSessions: Object.keys(globals.webServer.koaSessionMemoryStore.sessions).length || '--',

        //Log stuff:
        logStorageSize: (await globals.logger.getStorageSize()).total,
        loggerStatusAdmin: globals.logger.admin.getUsageStats(),
        loggerStatusFXServer: globals.logger.fxserver.getUsageStats(),
        loggerStatusServer: globals.logger.server.getUsageStats(),

        //Settings
        cooldown: globals.healthMonitor.config.cooldown,
        schedule: globals.healthMonitor.config.restarterSchedule.join(', ') || '--',
        commandLine: (globals.fxRunner.config.commandLine && globals.fxRunner.config.commandLine.length)
            ? helpers.redactApiKeys(globals.fxRunner.config.commandLine)
            : '--',
        fxServerPath: txEnv.fxServerPath,
        serverDataPath: globals.fxRunner.config.serverDataPath,
        cfgPath: globals.fxRunner.config.cfgPath,
        fxServerHost: (globals.fxRunner.fxServerHost)
            ? globals.fxRunner.fxServerHost
            : '--',
    };
}
