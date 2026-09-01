import { DEMO_MODE } from "./demoMode";
import {
  api as liveApi,
  streamGenerate as liveStreamGenerate,
  streamOpencodeLog as liveStreamOpencodeLog,
} from "./api.live";
import {
  api as staticApi,
  streamGenerate as staticStreamGenerate,
  streamOpencodeLog as staticStreamOpencodeLog,
} from "./api.static";
import type { StreamGenerate, StreamOpencodeLog } from "./apiClient";

export const api = DEMO_MODE ? staticApi : liveApi;
export const streamGenerate: StreamGenerate = DEMO_MODE ? staticStreamGenerate : liveStreamGenerate;
export const streamOpencodeLog: StreamOpencodeLog = DEMO_MODE ? staticStreamOpencodeLog : liveStreamOpencodeLog;
export type { ChartDatum } from "./types";
