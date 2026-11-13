// IPC solo existe si el padre creó este proceso con un canal privado; no es HTTP.
export function installShutdown(close:()=>Promise<void>):()=>void {
  let stopping=false;
  let deadline:NodeJS.Timeout|undefined;
  const remove=()=>{process.off('SIGINT',stop);process.off('SIGTERM',stop);process.off('message',message);if(deadline)clearTimeout(deadline);};
  const stop=()=>{
    if(stopping)return;stopping=true;
    deadline=setTimeout(()=>{console.error('Cierre acotado agotado; el trabajo pendiente se recuperará desde PostgreSQL.');process.exit(1);},20000);
    deadline.unref();
    void close().then(()=>{remove();if(process.connected)process.disconnect();})
      .catch(()=>{remove();process.exitCode=1;if(process.connected)process.disconnect();});
  };
  const message=(value:unknown)=>{if(value==='shutdown')stop();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);process.on('message',message);
  return remove;
}
