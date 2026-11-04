import {env} from 'cloudflare:workers';
import {createObjectStore} from './d1-store.mjs';
export {BlobNotFoundError,BlobPreconditionFailedError,BlobAlreadyExistsError,BlobPathnameMismatchError} from './d1-store.mjs';
const store=()=>{if(!env.STATE)throw Error('STATE_NOT_CONFIGURED');return createObjectStore(env.STATE,{readOnly:env.MIGRATION_READ_ONLY!=='false'});};
export const head=(...args)=>store().head(...args);
export const get=(...args)=>store().get(...args);
export const put=(...args)=>store().put(...args);
export const del=(...args)=>store().del(...args);
