(function(root) {
    'use strict';
    const PREFIX = 'Shift_cal 근무 일정\n메모:\n';
    const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    function local(override,memo) { return {override:override || 'BASE',memo:memo || ''}; }
    function colorId(shift) {
        if(shift.type === 'LEAVE')return '2';
        if(['OFF','FORCED_OFF','UNPAID_OFF'].includes(shift.type))return null;
        return shift.type === 'NIGHT' || ['SPECIAL_NIGHT','SPECIAL_NIGHT_NO_OT'].includes(shift.type) || shift.origType === 'NIGHT' ? '1' : '5';
    }
    function signature(event) {
        if (!event || event.status === 'cancelled') return null;
        return JSON.stringify({summary:event.summary || '',description:event.description || '',start:event.start,end:event.end,
            recurrence:event.recurrence || null,recurringEventId:event.recurringEventId || null});
    }
    function origin(event) {
        const props = event?.extendedProperties?.private;
        if (props?.app === 'shift_cal_v2' && props.kind === 'shift') return props.originDate;
        const match = /^sc2[a-c](\d{4})(\d{2})(\d{2})(?:r[a-f0-9]{16})?$/.exec(event?.id || '');
        return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
    }
    function planOutbound(remote,desired) {
        if(!remote||remote.status==='cancelled')return 'insert';
        if(remote.recurrence||remote.recurringEventId)return 'blocked';
        if(signature(remote)!==signature(desired))return 'patch';
        if((remote.colorId??null)!==(desired.colorId??null)||remote.visibility!=='private')return 'color';
        return 'adopt';
    }
    root.GoogleSyncCore = {PREFIX,equal,local,colorId,signature,origin,planOutbound};
    if (typeof module !== 'undefined') module.exports = root.GoogleSyncCore;
})(globalThis);
