import { SceneRecord } from '../models/types';

export const ROOT_SCENE_ID = 'scene_jiuzhou_world';

export const sceneDb = {
  /**
   * 获取面向客户端的场景列表（排除不可见根世界地图节点，仅展示根节点下的锚点）
   */
  async listScenes(db: D1Database): Promise<SceneRecord[]> {
    const { results } = await db.prepare(
      'SELECT id, name, region, level, parent_id, icon, coord_x, coord_y, status_desc, tag, subtitle, thumb, background_url, description, feature, cost_desc, btn_text FROM scenes WHERE id != ? ORDER BY coord_x ASC'
    )
      .bind(ROOT_SCENE_ID)
      .all<SceneRecord>();

    return results || [];
  },

  /**
   * 根据场景 ID 获取单个场景元数据
   */
  async getSceneById(db: D1Database, sceneId: string): Promise<SceneRecord | null> {
    const scene = await db.prepare(
      'SELECT id, name, region, level, parent_id, icon, coord_x, coord_y, status_desc, tag, subtitle, thumb, background_url, description, feature, cost_desc, btn_text FROM scenes WHERE id = ? LIMIT 1'
    )
      .bind(sceneId)
      .first<SceneRecord>();

    return scene || null;
  },
};
