#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ThinqNotifierStack } from '../lib/thinq-notifier-stack';

const app = new cdk.App();
new ThinqNotifierStack(app, 'ThinqNotifierStack');
