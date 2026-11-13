import { Experiment, requiredUrl } from './support.js';

const [app, queue] = process.argv.slice(2);
if (!app || !queue || !process.send) throw new Error('Consumidor reservado al experimento IPC');
const experiment = new Experiment(app, queue, requiredUrl());
try {
  await experiment.boss.start();
  const claim = await experiment.reserve();
  if (!claim) throw new Error('No hay reserva');
  // El IPC solo transmite identidad de trabajo y contador; ninguna credencial.
  process.send({ kind: 'reserved', id: claim.id, retryCount: claim.retryCount });
  // Espera de control del experimento, fuera de transacción. El padre lo mata.
  setInterval(() => {}, 1000);
} catch {
  await experiment.close();
  process.send({ kind: 'error' });
  process.exitCode = 1;
  process.disconnect();
}
