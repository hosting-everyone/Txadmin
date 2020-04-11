//Requires
const modulename = 'FXRunner';
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const sleep = require('util').promisify((a, f) => setTimeout(f, a));
const { parseArgsStringToArgv } = require('string-argv');
const pidtree = require('pidtree');
const { dir, log, logOk, logWarn, logError} = require('../../extras/console')(modulename);
const helpers = require('../../extras/helpers');
const ConsoleBuffer = require('./consoleBuffer');

//Helpers
const now = () => { return Math.round(new Date() / 1000) };


module.exports = class FXRunner {
    constructor(config) {
        logOk('Started');
        this.config = config;
        this.spawnVariables = null;
        this.fxChild = null;
        this.tsChildStarted = null;
        this.fxServerPort = null;
        this.consoleBuffer = new ConsoleBuffer(this.config.logPath, 10);

        //The setTimeout is not strictly necessary, but it's nice to have other errors in the top before fxserver starts.
        if(config.autostart){
            setTimeout(() => {
                this.spawnServer(true);
            }, config.autostartDelay * 1000);
        }
    }


    //================================================================
    /**
     * Refresh fxRunner configurations
     */
    refreshConfig(){
        this.config = globals.configVault.getScoped('fxRunner');
    }//Final refreshConfig()


    //================================================================
    /**
     * Setup the spawn parameters
     */
    setupVariables(){
        // Prepare extra args
        let extraArgs;
        if(typeof this.config.commandLine === 'string' || this.config.commandLine.length){
            extraArgs = parseArgsStringToArgv(this.config.commandLine);
        }else{
            extraArgs = [];
        }

        // Prepare default args
        const cmdArgs = [
            '+sets', 'txAdmin-version', GlobalData.txAdminVersion,
            '+set', 'txAdmin-apiPort', GlobalData.txAdminPort,
            '+set', 'txAdmin-apiToken', globals.webServer.intercomToken,
            '+set', 'txAdminServerMode', 'true',
            '+set', 'onesync_enabled', (this.config.onesync).toString(),
            ...extraArgs,
            '+exec', this.config.cfgPath,
        ];

        // Configure spawn parameters according to the environment
        if(GlobalData.osType === 'Linux'){
            let alpinePath = path.resolve(GlobalData.fxServerPath, '../../');
            this.spawnVariables = {
                shell: `${alpinePath}/opt/cfx-server/ld-musl-x86_64.so.1`,
                cmdArgs: [
                    `--library-path`, `${alpinePath}/usr/lib/v8/:${alpinePath}/lib/:${alpinePath}/usr/lib/`,
                    '--',
                    `${alpinePath}/opt/cfx-server/FXServer`,
                    '+set', 'citizen_dir', `${alpinePath}/opt/cfx-server/citizen/`,
                    ...cmdArgs
                ]
            };
            
        }else if(GlobalData.osType === 'Windows_NT'){
            this.spawnVariables = {
                shell: `${GlobalData.fxServerPath}/FXServer.exe`,
                cmdArgs
            };
            
        }else{
            logError(`OS type not supported: ${GlobalData.osType}`);
            process.exit();
        }

    }//Final setupVariables()


    //================================================================
    /**
     * Spawns the FXServer and sets up all the event handlers
     * @param {boolean} announce
     * @returns {string} null or error message
     */
    async spawnServer(announce){
        log("Starting FXServer");
        //Setup variables
        this.setupVariables();
        if(GlobalData.verbose){
            log(`Executing:`);
            dir(this.spawnVariables);
        }
        //Sanity Check
        if(
            this.spawnVariables == null ||
            typeof this.spawnVariables.shell == 'undefined' ||
            typeof this.spawnVariables.cmdArgs == 'undefined'
        ){
            return logError('this.spawnVariables is not set.');
        }
        //If the any FXServer configuration is missing
        if(this.config.basePath === null || this.config.cfgPath === null){
            return logError('Cannot start the server with missing configuration (basePath || cfgPath).');
        }
        //If the server is already alive
        if(this.fxChild !== null){
            return logError('The server is already started.');
        }

        //Detecting endpoint port
        try {
            let cfgFilePath = helpers.resolveCFGFilePath(this.config.cfgPath, this.config.basePath);
            let rawCfgFile = helpers.getCFGFileData(cfgFilePath);
            this.fxServerPort = helpers.getFXServerPort(rawCfgFile);
        } catch (error) {
            let errMsg =  logError(`FXServer config error: ${error.message}`);
            //the IF below is only a way to disable the endpoint check
            if(globals.config.forceFXServerPort){
                this.fxServerPort = globals.config.forceFXServerPort;
            }else{
                return errMsg;
            }
        }

        //Reseting hitch counter
        globals.monitor.clearFXServerHitches();

        //Announcing
        if(announce === 'true' || announce === true){
            let discordMessage = globals.translator.t('server_actions.spawning_discord', {servername: globals.config.serverName});
            globals.discordBot.sendAnnouncement(discordMessage);
        }

        //Starting server
        let pid;
        let tsStart = now();
        try {
            this.fxChild = spawn(
                this.spawnVariables.shell,
                this.spawnVariables.cmdArgs,
                {cwd: this.config.basePath}
            );
            if(typeof this.fxChild.pid === 'undefined'){
                const platformComplaint = (GlobalData.osType === 'Windows_NT') ? 'Make sure you have "C:/windows/system32" in your system PATH variables.' : '';
                throw new Error(`Executon of "${this.spawnVariables.shell}" failed. ${platformComplaint}`);
            }
            pid = this.fxChild.pid.toString();
            logOk(`>> [${pid}] FXServer Started!`);
            this.consoleBuffer.writeHeader();
            this.tsChildStarted = tsStart;
        } catch (error) {
            logError('Failed to start FXServer with the following error:');
            dir(error);
            process.exit(0);
        }

        //Setting up stream handlers
        this.fxChild.stdout.setEncoding('utf8');
        //process.stdin.pipe(this.fxChild.stdin);

        //Setting up event handlers
        this.fxChild.on('close', function (code, signal) {
            logWarn(`>> [${pid}] FXServer Closed. (code ${code})`);
        });
        this.fxChild.on('disconnect', function () {
            logWarn(`>> [${pid}] FXServer Disconnected.`);
        });
        this.fxChild.on('error', function (err) {
            logWarn(`>> [${pid}] FXServer Errored:`);
            dir(err)
        });
        this.fxChild.on('exit', function (code, signal) {
            process.stdout.write("\n"); //Make sure this isn't concatenated with the last line
            logWarn(`>> [${pid}] FXServer Exited.`);
            if(now() - tsStart <= 5){
                setTimeout(() => {
                    logWarn(`FXServer didn't start. This is not an issue with txAdmin.`);
                }, 500);
            }
        });

        this.fxChild.stdin.on('error', (data) => {});
        this.fxChild.stdin.on('data', (data) => {});

        this.fxChild.stdout.on('error', (data) => {});
        this.fxChild.stdout.on('data', this.consoleBuffer.write.bind(this.consoleBuffer));

        this.fxChild.stderr.on('error', (data) => {});
        this.fxChild.stderr.on('data', this.consoleBuffer.writeError.bind(this.consoleBuffer));

        //Setting up process priority
        setTimeout(() => {
            this.setProcPriority();
        }, 2500);

        return null;
    }//Final spawnServer()


    //================================================================
    /**
     * Sets the process priority to all fxChild (cmd/bash) children (fxserver)
     */
    async setProcPriority(){
        //Sanity check
        if(typeof this.config.setPriority !== 'string') return;
        let priority = this.config.setPriority.toUpperCase();

        if(priority === 'NORMAL') return;
        let validPriorities = ['LOW', 'BELOW_NORMAL', 'NORMAL', 'ABOVE_NORMAL', 'HIGH', 'HIGHEST'];
        if(!validPriorities.includes(priority)){
            logWarn(`Couldn't set the processes priority: Invalid priority value. (Use one of these: ${validPriorities.join()})`);
            return;
        }
        if(!this.fxChild.pid){
            logWarn(`Couldn't set the processes priority: Unknown PID.`);
            return;
        }

        //Get children and set priorities
        try {
            let pids = await pidtree(this.fxChild.pid);
            pids.forEach(pid => {
                os.setPriority(pid, os.constants.priority['PRIORITY_'+priority]);
            });
            log(`Priority set ${priority} for processes ${pids.join()}`)
        } catch (error) {
            logWarn("Couldn't set the processes priority.");
            if(GlobalData.verbose) dir(error);
        }
    }


    //================================================================
    /**
     * Restarts the FXServer
     * @param {string} tReason
     */
    async restartServer(tReason){
        try {
            //If a reason is provided, announce restart on discord, kick all players and wait 500ms
            if(typeof tReason === 'string'){
                let tOptions = {
                    servername: globals.config.serverName,
                    reason: tReason
                }
                let discordMessage = globals.translator.t('server_actions.restarting_discord', tOptions);
                globals.discordBot.sendAnnouncement(discordMessage);
                let kickMessage = globals.translator.t('server_actions.restarting', tOptions).replace(/\"/g, '\\"');
                this.srvCmd(`txaKickAll "${kickMessage}"`);
                await sleep(500);
            }

            //Restart server
            this.killServer();
            await sleep(this.config.restartDelay);
            return this.spawnServer();
        } catch (error) {
            let errMsg = logError("Couldn't restart the server.");
            if(GlobalData.verbose) dir(error);
            return errMsg;
        }
    }


    //================================================================
    /**
     * Kills the FXServer
     * @param {string} tReason
     */
    async killServer(tReason){
        try {
            //If a reason is provided, announce restart on discord, kick all players and wait 500ms
            if(typeof tReason === 'string'){
                let tOptions = {
                    servername: globals.config.serverName,
                    reason: tReason
                }
                let discordMessage = globals.translator.t('server_actions.stopping_discord', tOptions);
                globals.discordBot.sendAnnouncement(discordMessage);
                let kickMessage = globals.translator.t('server_actions.stopping', tOptions).replace(/\"/g, '\\"');
                this.srvCmd(`txaKickAll "${kickMessage}"`);
                await sleep(500);
            }

            //Stopping server
            if(this.fxChild !== null){
                this.fxChild.kill();
                this.fxChild = null;
            }
            return true;
        } catch (error) {
            logError("Couldn't kill the server. Perhaps What Is Dead May Never Die.");
            if(GlobalData.verbose) dir(error);
            this.fxChild = null;
            return false;
        }
    }


    //================================================================
    /**
     * Pipe a string into FXServer's stdin (aka executes a cfx's command)
     * @param {string} command
     */
    srvCmd(command){
        if(typeof command !== 'string') throw new Error('Expected String!');
        if(this.fxChild === null) return false;
        try {
            let success = this.fxChild.stdin.write(command + "\n");
            globals.webServer.webConsole.buffer(command, 'command');
            return success;
        } catch (error) {
            if(GlobalData.verbose){
                logError('Error writing to fxChild.stdin');
                dir(error);
            }
            return false;
        }
    }


    //================================================================
    /**
     * Pipe a string into FXServer's stdin (aka executes a cfx's command) and returns the stdout output.
     * @param {*} command
     * @param {*} bufferTime the size of the buffer in milliseconds
     * @returns {string} buffer
     */
    async srvCmdBuffer(command, bufferTime){
        if(typeof command !== 'string') throw new Error('Expected String!');
        if(this.fxChild === null) return false;
        bufferTime = (bufferTime !== undefined)? bufferTime : 1500;
        this.consoleBuffer.cmdBuffer = '';
        this.consoleBuffer.enableCmdBuffer = true;
        let result = this.srvCmd(command);
        if(!result) return false;
        await sleep(bufferTime);
        this.consoleBuffer.enableCmdBuffer = false;
        return this.consoleBuffer.cmdBuffer.replace(/\u001b\[\d+(;\d)?m/g, '');
    }

} //Fim FXRunner()
