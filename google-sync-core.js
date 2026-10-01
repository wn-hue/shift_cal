(function(root) {
    'use strict';
    const PREFIX = 'Shift_cal 근무 일정\n메모:\n';
    const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    function local(override,memo) { return {override:override || 'BASE',memo:memo || ''}; }
    function colorId(shift) {
        if(shift.type === 'LEAVE')return '2';
        if(['OFF','FORCED_OFF','UNPAID_OFF'].includes(shift.type))return null;
        return shift.type === 'NIGHT' || shift.type === 'SPECIAL_NIGHT' || shift.origType === 'NIGHT' ? '1' : '5';
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
    function memo(event) { const text = (event.description || '').replace(/\r\n?/g,'\n'); return text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text; }
    function infer(summary,baseType) {
        const text = (summary || '').replace(/^[ABC]조\s*/,'').trim();
        const maps = [ [/^무급 반차\(전\)/,'UNPAID_HALF_PRE'],[/^무급 반차\(후\)/,'UNPAID_HALF_POST'],[/^무반\(전\)/,'UNPAID_HALF_PRE'],[/^무반\(후\)/,'UNPAID_HALF_POST'],
            [/^반차\(전\)/,'HALF_PRE'],[/^반차\(후\)/,'HALF_POST'],[/^연차(?:\s|$|·)/,'LEAVE'],[/^(?:주간 특근|주특)(?:\s|$|·)/,'SPECIAL_DAY'],
            [/^(?:야간 특근|야특)(?:\s|$|·)/,'SPECIAL_NIGHT'],[/^무급(?:\s|$|·)/,'UNPAID_OFF'],[/^휴무(?:\s|$|·)/,baseType === 'OFF' ? 'BASE':'FORCED_OFF'] ];
        for (const [pattern,type] of maps) if (pattern.test(text)) return type;
        if (/O\.?T\.?\s*해제|정시퇴근/.test(text)) return baseType === 'OFF' ? null : 'NO_OT';
        if (/^주간(?:\s+\d+일차)?(?:\s*·.*)?$/.test(text) && baseType === 'DAY') return 'BASE';
        if (/^야간(?:\s+\d+일차)?(?:\s*·.*)?$/.test(text) && baseType === 'NIGHT') return 'BASE';
        return null;
    }
    function plan(localValue, record, remote, desired) {
        if (!remote || remote.status === 'cancelled') return record || remote ? 'deleted' : 'insert';
        if (!record) return signature(remote) === signature(desired) ? 'adopt' :
            localValue.override !== 'BASE' || localValue.memo ? 'conflict' : 'inbound';
        const localChanged = !equal(localValue,record.local);
        const remoteChanged = signature(remote) !== record.signature;
        if (signature(remote) === signature(desired)) return 'adopt';
        if (localChanged && remoteChanged) return 'conflict';
        if (remoteChanged) return 'inbound';
        // Schedule rules can change even when the user's override and memo do not.
        return localChanged || signature(desired) !== record.signature ? 'patch':'adopt';
    }
    root.GoogleSyncCore = {PREFIX,equal,local,colorId,signature,origin,memo,infer,plan};
    if (typeof module !== 'undefined') module.exports = root.GoogleSyncCore;
})(globalThis);
