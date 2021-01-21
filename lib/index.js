/*********************************************************************************
 1. Dependencies
 *********************************************************************************/

const Hoek = require('@hapi/hoek');
const CronJob = require('cron').CronJob;
const PluginPackage = require('../package.json');


/*********************************************************************************
 2. Internals
 *********************************************************************************/

const internals = {};

internals.identifyJob = (job) => (job.id || job.name);

internals.reloadJob = (job, jobs, server) => {

    job.stop();
    jobs[internals.identifyJob(job)] = internals.registerJob(job, jobs, server);
    job.start();
};

internals.registerJob = (job, jobs, server) => {

    Hoek.assert(!job.id && !jobs[job.id], 'Job id has already been defined');
    Hoek.assert(!jobs[job.name], 'Job name has already been defined');
    Hoek.assert(job.name, 'Missing job name');
    Hoek.assert(job.time, 'Missing job time');
    Hoek.assert(job.timezone, 'Missing job time zone');
    Hoek.assert(job.request, 'Missing job request options');
    Hoek.assert(job.request.url, 'Missing job request url');
    Hoek.assert(typeof job.onComplete === 'function' || typeof job.onComplete === 'undefined', 'onComplete value must be a function');

    try {
        jobs[internals.identifyJob(job)] = new CronJob(job.time, internals.trigger(server, job), null, false, job.timezone);
    }
    catch (err) {
        if (err.message === 'Invalid timezone.') {
            Hoek.assert(!err, 'Invalid timezone. See https://momentjs.com/timezone for valid timezones');
        }
        else {
            Hoek.assert(!err, 'Time is not a cron expression');
        }
    }
};

internals.trigger = (server, job) => {

    return async () => {

        server.log([PluginPackage.name], internals.identifyJob(job));

        const res = await server.inject(job.request);

        /* istanbul ignore else  */
        if (job.onComplete) {
            job.onComplete(res.result);
        }
    };
};

internals.onPostStart = (jobs) => {

    return () => {

        for (const key of Object.keys(jobs)) {
            jobs[key].start();
        }
    };
};

internals.onPreStop = (jobs) => {

    return () => {

        for (const key of Object.keys(jobs)) {
            jobs[key].stop();
        }
    };
};


/*********************************************************************************
 3. Exports
 *********************************************************************************/

const PluginRegistration = (server, options) => {

    const jobs = {};
    if (!options.jobs || !options.jobs.length) {
        server.log([PluginPackage.name], 'No cron jobs provided.');
    }
    else {
        options.jobs.forEach((job) => internals.registerJob(job, jobs, server));
    }

    const reloadJob = (job) => {

        const existingJob = (jobs[internals.identifyJob(job)]);
        Hoek.assert(existingJob, `Missing job ${internals.identifyJob(job)}`);
        internals.reloadJob(job, jobs, server);
    };

    server.expose('jobs', jobs);
    server.expose('reloadJob', reloadJob);
    server.ext('onPostStart', internals.onPostStart(jobs));
    server.ext('onPreStop', internals.onPreStop(jobs));
};

exports.plugin = {
    register: PluginRegistration,
    pkg: PluginPackage
};
