-- 场景大地图/子地图底图背景支持
-- 每个场景锚点可配置 background_url，进入该场景或其子级地图时，底图展示该背景
ALTER TABLE scenes ADD COLUMN background_url TEXT DEFAULT '';
