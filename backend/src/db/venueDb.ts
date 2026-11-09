export interface VenueRecord {
  id: string;
  scene_id: string;
  name: string;
  badge: string | null;
  tag: string | null;
  description: string | null;
  chips_json: string | null;
  action_notice: string | null;
  img: string | null;
  sort_order?: number;
}

export const venueDb = {
  /**
   * 获取指定场景下的所有坊市/名胜建筑列表
   */
  async listVenuesByScene(db: D1Database, sceneId: string): Promise<VenueRecord[]> {
    const { results } = await db.prepare(
      'SELECT * FROM venues WHERE scene_id = ? ORDER BY sort_order ASC'
    )
      .bind(sceneId)
      .all<VenueRecord>();

    return results || [];
  },
};
