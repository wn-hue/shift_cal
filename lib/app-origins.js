'use strict';
const config=require('../origin-migration-config.json');
const origins=Object.freeze([config.source,config.target,...(config.previous||[])]);
module.exports={config,origins,trusted:value=>origins.includes(value)};
