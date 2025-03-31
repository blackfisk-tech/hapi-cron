/*********************************************************************************
 1. Dependencies
 *********************************************************************************/

import * as Hoek from '@hapi/hoek';
import Cron from 'cron';
import PluginPackage from '../package.json' with { type: 'json' };


/*********************************************************************************
 2. Internals
 *********************************************************************************/

const internals = {};

internals.loadJob = (hash, job, jobs, server) => {

    if (!hash && !jobs[job.hash]) {
        // If Hash is New: [Register New Job ==> Start New Job]
        job.hash = job.name
        internals.registerJob(job, jobs, server);
        jobs[job.hash].start();
    }
    else if (hash && jobs[hash] && hash !== job.hash) {
        // If Hash has Changed: [Register New Job ==> Start New Job ==> Stop Old Job]
        internals.registerJob(job, jobs, server);
        jobs[job.hash].start();
        jobs[hash].stop();
        delete jobs[hash];
    }
};

internals.removeJob = (hash, jobs) => {
    // Remove Job if Hash Exists
    if (jobs[hash]) {
        jobs[hash].stop();
        delete jobs[hash];
    }
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
        jobs[job.hash] = new Cron.CronJob(job.time, internals.trigger(server, job), null, false, job.timezone);
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

        server.log([PluginPackage.name], job.hash);

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

    const loadJob = ({
        hash = null,
        job = { hash: null }
    } = {}) => {
        if (!hash && !job.hash) {
            return false
        }
        if (!('hash' in job)) {
            return false
        }
        internals.loadJob(hash, job, jobs, server);
    };

    const removeJob = (hash) => {

        internals.removeJob(hash, jobs);
    };

    server.expose('jobs', jobs);
    server.expose('load', loadJob);
    server.expose('remove', removeJob);
    server.ext('onPostStart', internals.onPostStart(jobs));
    server.ext('onPreStop', internals.onPreStop(jobs));
};

export const plugin = {
    register: PluginRegistration,
    pkg: PluginPackage
};
