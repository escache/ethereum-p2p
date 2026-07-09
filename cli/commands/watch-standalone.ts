#!/usr/bin/env node
/** Standalone Bob watcher — used by live-demo and run directly */
import { loadConfig } from '../config/load';
import { runClientWatch } from './client';

const args = process.argv.slice(2);

runClientWatch(loadConfig(), args).then((code) => process.exit(code));
