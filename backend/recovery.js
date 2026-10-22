// Contact details and provider credentials come only from private environment variables.
export function createRecovery(env=process.env,fetcher=fetch) {
  const contacts={sms:env.RECOVERY_PHONE||'',email:env.RECOVERY_EMAIL||''};
  const ready=!!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_VERIFY_SERVICE_SID);
  async function post(resource,data){
    let r;try{r=await fetcher(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${resource}`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(data),signal:AbortSignal.timeout(10000)});}catch{const e=Error('Recovery delivery provider unavailable');e.status=503;throw e;}
    if(!r.ok){const e=Error(r.status===404?'Code expired or invalid. Request a new code.':'Recovery provider could not complete this request. Check provider configuration.');e.status=r.status===404?400:503;throw e;}
    return r.json();
  }
  return {
    config(){return {enabled:ready,phone:contacts.sms,email:contacts.email?contacts.email.replace(/^(.{2}).*(@.*)$/,'$1…$2'):'',channels:Object.keys(contacts).filter(c=>contacts[c])};},
    matches(channel,value){return !!contacts[channel]&&value===contacts[channel];},
    async send(channel){if(!ready){const e=Error('Recovery delivery is not configured. Contact the administrator.');e.status=503;throw e;}await post('Verifications',{To:contacts[channel],Channel:channel});},
    async verify(channel,code){if(!ready)return false;const result=await post('VerificationCheck',{To:contacts[channel],Code:code});return result.status==='approved';}
  };
}
