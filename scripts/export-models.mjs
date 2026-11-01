// Regenerate the original Blender assets. Initial authoring was executed through
// Blender MCP; this optional offline command uses the same saved authoring script.
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const candidates = [process.env.BLENDER_EXECUTABLE];
if (process.platform === 'win32') {
  const directory = join(process.env.ProgramFiles ?? 'C:/Program Files', 'Blender Foundation');
  if (existsSync(directory)) {
    for (const folder of readdirSync(directory).sort().reverse()) candidates.push(join(directory, folder, 'blender.exe'));
  }
} else if (process.platform === 'darwin') candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
const executable = candidates.find(path => path && existsSync(path)) ?? 'blender';
const script = fileURLToPath(new URL('./build_blender_models.py', import.meta.url));
const result = spawnSync(executable, ['--background', '--factory-startup', '--python', script], { stdio: 'inherit' });
if (result.error) {
  console.error('Blender를 찾을 수 없습니다. BLENDER_EXECUTABLE 환경 변수에 blender.exe 경로를 지정하세요.');
  process.exit(1);
}
process.exit(result.status ?? 1);
