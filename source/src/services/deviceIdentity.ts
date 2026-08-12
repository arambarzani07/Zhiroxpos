const DEVICE_KEY='zhirox-device-id-v19';
let memoryDeviceId:string|undefined;

export class DeviceIdentityError extends Error {}

const secureRandomId=()=>{
  const cryptoApi=globalThis.crypto;
  if(!cryptoApi?.getRandomValues)throw new DeviceIdentityError('SECURE_RANDOM_UNAVAILABLE');
  if(cryptoApi.randomUUID)return `device-${cryptoApi.randomUUID()}`;
  const bytes=new Uint8Array(16);cryptoApi.getRandomValues(bytes);
  return `device-${Array.from(bytes).map(v=>v.toString(16).padStart(2,'0')).join('')}`;
};

export const getDeviceId=()=>{
  if(memoryDeviceId)return memoryDeviceId;
  try{
    const existing=localStorage.getItem(DEVICE_KEY);if(existing){memoryDeviceId=existing;return existing;}
    const created=secureRandomId();localStorage.setItem(DEVICE_KEY,created);memoryDeviceId=created;return created;
  }catch(error){if(error instanceof DeviceIdentityError)throw error;throw new DeviceIdentityError('DEVICE_STORAGE_UNAVAILABLE');}
};

export const getDeviceLabel=()=>{
  const platform=typeof navigator!=='undefined'?navigator.platform||'POS':'POS';
  const agent=typeof navigator!=='undefined'?navigator.userAgent.split(' ').slice(0,3).join(' '):'Browser';
  return `${platform} • ${agent}`.slice(0,180);
};
