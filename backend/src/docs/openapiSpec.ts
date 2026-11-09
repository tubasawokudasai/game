export const openApiSpec = {
  "openapi": "3.0.3",
  "info": {
    "title": "万象录 完整 API 文档",
    "version": "1.0.0",
    "description": "《万象录》全模块接口文档（包含角色、战斗、NPC剧情、药道、大地图及全部管理后台接口）。"
  },
  "servers": [
    {
      "url": "/",
      "description": "当前运行环境"
    }
  ],
  "tags": [
    {
      "name": "认证模块 (Auth)",
      "description": "游客免登录、用户注册、账号合并与账密登录"
    },
    {
      "name": "角色模块 (Player)",
      "description": "角色信息、行囊背包、同道队伍、预设与修仙档案"
    },
    {
      "name": "场景大地图 (Map)",
      "description": "大世界区域、地点场馆与建筑信息"
    },
    {
      "name": "NPC与剧情 (NPC & Dialogue)",
      "description": "NPC交互对话、树状/线性剧情推进、选项决策与剧情分支"
    },
    {
      "name": "战斗系统 (Combat)",
      "description": "遭遇战推演准备、战斗结算与战利品发放"
    },
    {
      "name": "悬壶馆与药道 (Pharmacy)",
      "description": "药阁名品购买、神农丹方炼制、药王回春疗伤"
    },
    {
      "name": "同道好友 (Friends)",
      "description": "好友列表、申请/接受/拒绝好友、同道搜索"
    },
    {
      "name": "飞鸽传书 (Mails)",
      "description": "玩家邮件收取、附件领取与全服邮件"
    },
    {
      "name": "游历与传送 (Travel)",
      "description": "御剑传送与场景移动"
    },
    {
      "name": "御灵博戏 (Casino)",
      "description": "博戏竞猜状态与下注结算"
    },
    {
      "name": "AI工具链 (AI Tools)",
      "description": "大模型辅助生成工具"
    },
    {
      "name": "管理后台-系统鉴权 (Admin Auth)",
      "description": "管理员账密登录、凭据会话与全服指标大盘"
    },
    {
      "name": "管理后台-场景建筑 (Admin Scenes)",
      "description": "大地图场景与建筑设施的新增、修改与删除"
    },
    {
      "name": "管理后台-玩家管理 (Admin Players)",
      "description": "全服玩家列表、属性面板查看与快捷维护操作"
    },
    {
      "name": "管理后台-NPC模板 (Admin NPC Templates)",
      "description": "NPC基础模板档案、数值成长配置与预览"
    },
    {
      "name": "管理后台-地图NPC (Admin World NPCs)",
      "description": "在大地图场景中添加/布置/调整/删除 NPC"
    },
    {
      "name": "管理后台-NPC实例 (Admin NPC Instances)",
      "description": "NPC 运行时实例列表、状态与重置"
    },
    {
      "name": "管理后台-战斗怪群 (Admin Monster Groups)",
      "description": "遭遇战敌方阵容编队、出战槽位与掉落管理"
    },
    {
      "name": "管理后台-丹药名品 (Admin Medicines)",
      "description": "悬壶馆名药上架、神农丹方配置与品阶管控"
    },
    {
      "name": "管理后台-剧情剧本 (Admin Dialogues)",
      "description": "可视化剧本包、对话节点、选项跳转与奖励联动"
    },
    {
      "name": "管理后台-神通功法 (Admin Skills)",
      "description": "修仙技能、主动/被动效果与威力配置"
    },
    {
      "name": "管理后台-奖励发放 (Admin Grants)",
      "description": "系统运营物品发放、邮件附件直投"
    },
    {
      "name": "管理后台-通知配置 (Admin Notifications)",
      "description": "升级奖励通知、剧情节点触发器通知配置"
    }
  ],
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "玩家认证 JWT 令牌（请求头 Authorization: Bearer <token>）"
      },
      "AdminCookieAuth": {
        "type": "apiKey",
        "in": "cookie",
        "name": "admin_session",
        "description": "管理后台管理员会话 Cookie"
      }
    },
    "schemas": {
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string",
            "description": "错误详细信息"
          }
        }
      }
    }
  },
  "paths": {
    "/": {
      "get": {
        "tags": [
          "系统探针 (System)"
        ],
        "summary": "服务器存活探测",
        "responses": {
          "200": {
            "description": "服务器运行正常",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "/api/auth/guest": {
      "post": {
        "tags": [
          "认证模块 (Auth)"
        ],
        "summary": "1. 匿名免登录换取 Token",
        "description": "1. 匿名免登录换取 Token",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/auth/register": {
      "post": {
        "tags": [
          "认证模块 (Auth)"
        ],
        "summary": "2. 账号升级 (原地转正)",
        "description": "2. 账号升级 (原地转正)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/auth/merge": {
      "post": {
        "tags": [
          "认证模块 (Auth)"
        ],
        "summary": "3. 现有账号合并",
        "description": "3. 现有账号合并",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/auth/login": {
      "post": {
        "tags": [
          "认证模块 (Auth)"
        ],
        "summary": "4. 正式账号直接登录",
        "description": "4. 正式账号直接登录",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/me": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "获取当前登录玩家全息资料",
        "description": "获取当前登录玩家全息资料",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/story/active": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "获取玩家进行中的任务",
        "description": "获取玩家进行中的任务",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/inventory": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "GET /api/player/inventory",
        "description": "GET /api/player/inventory",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/inventory/use": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/inventory/use",
        "description": "POST /api/player/inventory/use",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/inventory/equip": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/inventory/equip",
        "description": "POST /api/player/inventory/equip",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/inventory/unequip": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/inventory/unequip",
        "description": "POST /api/player/inventory/unequip",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/inventory/tidy": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/inventory/tidy",
        "description": "POST /api/player/inventory/tidy",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/inventory/discard": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/inventory/discard",
        "description": "POST /api/player/inventory/discard",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/party": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "获取玩家自己的同道小队列表",
        "description": "获取玩家自己的同道小队列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/party/{memberKey}": {
      "patch": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "切换伙伴出战 / 休息状态",
        "description": "切换伙伴出战 / 休息状态",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "memberKey",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "memberKey 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/presets": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "内容预设：头像立绘目录 + 道号取名库",
        "description": "内容预设：头像立绘目录 + 道号取名库",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/profile": {
      "put": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "PUT /api/player/profile",
        "description": "PUT /api/player/profile",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "POST /api/player/profile",
        "description": "POST /api/player/profile",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/player/profile/{id}": {
      "get": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "获取指定道友全息档案",
        "description": "获取指定道友全息档案",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/player/{id}/like": {
      "post": {
        "tags": [
          "角色模块 (Player)"
        ],
        "summary": "为指定道友赞叹/点赞",
        "description": "为指定道友赞叹/点赞",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/map": {
      "get": {
        "tags": [
          "场景大地图 (Map)"
        ],
        "summary": "纯数据库驱动：动态读取 D1 scenes 表全量数据",
        "description": "获取全九州所有场景元数据列表 (大区、都城、坊市)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/map/venues": {
      "get": {
        "tags": [
          "场景大地图 (Map)"
        ],
        "summary": "注意：必须注册在 /:mapId 之前，否则 /venues 会被当成 mapId 匹配",
        "description": "获取指定场景内的坊市/名胜画卷",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/map/{mapId}": {
      "get": {
        "tags": [
          "场景大地图 (Map)"
        ],
        "summary": "纯数据库驱动：完全去除代码中的硬编码数据，动态读取 scenes 与 npc_instances 表",
        "description": "获取指定地图场景元数据与常驻 NPC 列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "mapId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "mapId 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/npc/dialogue/start": {
      "post": {
        "tags": [
          "NPC与剧情 (NPC & Dialogue)"
        ],
        "summary": "阶段一：开启 NPC 有向图对话",
        "description": "阶段一：开启 NPC 有向图对话",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/npc/dialogue/advance": {
      "post": {
        "tags": [
          "NPC与剧情 (NPC & Dialogue)"
        ],
        "summary": "阶段一·续：无分支直连推进",
        "description": "阶段一·续：无分支直连推进",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/npc/dialogue/select": {
      "post": {
        "tags": [
          "NPC与剧情 (NPC & Dialogue)"
        ],
        "summary": "阶段二：选择 NPC 对话选项",
        "description": "阶段二：选择 NPC 对话选项",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/combat/prepare": {
      "post": {
        "tags": [
          "战斗系统 (Combat)"
        ],
        "summary": "战前准备：按当前玩家的出战队伍与怪物组模版组装双方阵容",
        "description": "战前准备：按当前玩家的出战队伍与怪物组模版组装双方阵容",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/combat/settle": {
      "post": {
        "tags": [
          "战斗系统 (Combat)"
        ],
        "summary": "战斗结算：服务端按真实阵容跑完整场对决，落库并返回胜负与后续剧情节点",
        "description": "战斗结算：服务端按真实阵容跑完整场对决，落库并返回胜负与后续剧情节点",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/combat/encounter/prepare": {
      "post": {
        "tags": [
          "战斗系统 (Combat)"
        ],
        "summary": "地图 NPC 野怪遭遇战前准备",
        "description": "地图 NPC 野怪遭遇战前准备",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/combat/encounter/settle": {
      "post": {
        "tags": [
          "战斗系统 (Combat)"
        ],
        "summary": "地图 NPC 野怪直战结算",
        "description": "地图 NPC 野怪直战结算",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/mails": {
      "get": {
        "tags": [
          "飞鸽传书 (Mails)"
        ],
        "summary": "获取玩家收件箱",
        "description": "获取玩家收件箱",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/mails/send": {
      "post": {
        "tags": [
          "飞鸽传书 (Mails)"
        ],
        "summary": "发送带附件或货币的交易邮件 (强事务保障)",
        "description": "发送带附件或货币的交易邮件 (强事务保障)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/mails/claim/{mailId}": {
      "post": {
        "tags": [
          "飞鸽传书 (Mails)"
        ],
        "summary": "提取邮件附件",
        "description": "提取邮件附件",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "mailId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "mailId 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/mails/admin-send": {
      "post": {
        "tags": [
          "飞鸽传书 (Mails)"
        ],
        "summary": "管理员/GM 发送系统信件接口",
        "description": "管理员/GM 发送系统信件接口",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/friends": {
      "get": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "1. 获取当前玩家仙友列表",
        "description": "1. 获取当前玩家仙友列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/friends/requests": {
      "get": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "2. 获取当前玩家收到的结交申请列表",
        "description": "2. 获取当前玩家收到的结交申请列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/friends/status/{targetPlayerId}": {
      "get": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "3. 检查与目标玩家的结交状态",
        "description": "3. 检查与目标玩家的结交状态",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "targetPlayerId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "targetPlayerId 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/friends/request": {
      "post": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "4. 发送结交申请",
        "description": "4. 发送结交申请",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/friends/accept": {
      "post": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "5. 同意结交申请 (添加为好友)",
        "description": "5. 同意结交申请 (添加为好友)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/friends/reject": {
      "post": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "6. 婉言谢绝结交申请",
        "description": "6. 婉言谢绝结交申请",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/friends/{friendId}": {
      "delete": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "7. 解除仙友羁绊",
        "description": "7. 解除仙友羁绊",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "friendId",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "friendId 路径参数"
          }
        ],
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/friends/search": {
      "get": {
        "tags": [
          "同道好友 (Friends)"
        ],
        "summary": "8. 寻访同道修士",
        "description": "8. 寻访同道修士",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/casino/status": {
      "get": {
        "tags": [
          "御灵博戏 (Casino)"
        ],
        "summary": "获取赌场当前期数盘面状态",
        "description": "获取赌场当前期数盘面状态",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/casino/bet": {
      "post": {
        "tags": [
          "御灵博戏 (Casino)"
        ],
        "summary": "玩家下注",
        "description": "获取赌场当前期数盘面状态",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/ai/tools": {
      "get": {
        "tags": [
          "AI工具链 (AI Tools)"
        ],
        "summary": "导出面向大模型 (LLM) Function Calling 的工具元数据清单",
        "description": "导出面向大模型 (LLM) Function Calling 的工具元数据清单",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/travel/teleport": {
      "post": {
        "tags": [
          "游历与传送 (Travel)"
        ],
        "summary": "跨城/跨州传送接口",
        "description": "跨城/跨州传送接口",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/pharmacy/info": {
      "get": {
        "tags": [
          "悬壶馆与药道 (Pharmacy)"
        ],
        "summary": "悬壶馆全貌信息接口",
        "description": "悬壶馆全貌信息接口",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/pharmacy/heal": {
      "post": {
        "tags": [
          "悬壶馆与药道 (Pharmacy)"
        ],
        "summary": "药王孙真人 · 全队回春疗伤",
        "description": "药王孙真人 · 全队回春疗伤",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/pharmacy/buy": {
      "post": {
        "tags": [
          "悬壶馆与药道 (Pharmacy)"
        ],
        "summary": "Body: { itemId: string, count?: number }",
        "description": "悬壶药阁 · 购药",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/pharmacy/craft": {
      "post": {
        "tags": [
          "悬壶馆与药道 (Pharmacy)"
        ],
        "summary": "Body: { recipeId: string, count?: number }",
        "description": "神农药鼎 · 丹药炼制",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/grants/catalog": {
      "get": {
        "tags": [
          "管理后台-奖励发放 (Admin Grants)"
        ],
        "summary": "系统发放模版目录",
        "description": "系统发放模版目录",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/grants/send": {
      "post": {
        "tags": [
          "管理后台-奖励发放 (Admin Grants)"
        ],
        "summary": "通过系统邮件发放道具 / 角色 / 货币",
        "description": "通过系统邮件发放道具 / 角色 / 货币",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications": {
      "get": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "后台「通知管理」一级页面使用。按事件维度返回列表。",
        "description": "通知事件列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/notifications/player-level-up": {
      "get": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "读取玩家升级通知配置",
        "description": "读取玩家升级通知配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "body: { enabled, title, content, grants: [{ type: 'ITEM'|'COMPANION'|'CURRENCY', ... }] }",
        "description": "保存玩家升级通知配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications/player-level-up/reset": {
      "post": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "恢复默认配置",
        "description": "恢复默认配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications/story-trigger": {
      "get": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "读取剧情节点触发器通知配置",
        "description": "读取剧情节点触发器通知配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "body: { enabled, title, content, grants }",
        "description": "保存剧情节点触发器通知配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications/story-trigger/reset": {
      "post": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "恢复剧情节点通知默认配置",
        "description": "恢复剧情节点通知默认配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications/story-notifications": {
      "get": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "剧情通知列表",
        "description": "==============================================================================",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "新建剧情通知",
        "description": "新建剧情通知",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/notifications/story-notifications/{id}": {
      "put": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "更新剧情通知",
        "description": "更新剧情通知",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-通知配置 (Admin Notifications)"
        ],
        "summary": "删除剧情通知",
        "description": "删除剧情通知",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/login": {
      "post": {
        "tags": [
          "管理后台-系统鉴权 (Admin Auth)"
        ],
        "summary": "管理员登录",
        "description": "管理员登录",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/me": {
      "get": {
        "tags": [
          "管理后台-系统鉴权 (Admin Auth)"
        ],
        "summary": "获取当前登录管理员信息",
        "description": "获取当前登录管理员信息",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/stats": {
      "get": {
        "tags": [
          "管理后台-系统鉴权 (Admin Auth)"
        ],
        "summary": "仪表盘概览统计",
        "description": "仪表盘概览统计",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/scenes": {
      "get": {
        "tags": [
          "管理后台-场景建筑 (Admin Scenes)"
        ],
        "summary": "获取所有地图场景列表",
        "description": "获取所有地图场景列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-场景建筑 (Admin Scenes)"
        ],
        "summary": "新增场景",
        "description": "新增场景",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/scenes/{id}": {
      "put": {
        "tags": [
          "管理后台-场景建筑 (Admin Scenes)"
        ],
        "summary": "更新地图场景",
        "description": "更新地图场景",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-场景建筑 (Admin Scenes)"
        ],
        "summary": "删除场景",
        "description": "删除场景",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/players": {
      "get": {
        "tags": [
          "管理后台-玩家管理 (Admin Players)"
        ],
        "summary": "分页检索玩家列表",
        "description": "分页检索玩家列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/players/{id}": {
      "get": {
        "tags": [
          "管理后台-玩家管理 (Admin Players)"
        ],
        "summary": "获取玩家详情",
        "description": "获取玩家详情",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-玩家管理 (Admin Players)"
        ],
        "summary": "修改玩家信息 (属性、财富、境界、坐标等)",
        "description": "修改玩家信息 (属性、财富、境界、坐标等)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-玩家管理 (Admin Players)"
        ],
        "summary": "删除玩家 (级联清除玩家相关所有记录与关联资产)",
        "description": "删除玩家 (级联清除玩家相关所有记录与关联资产)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/players/{id}/quick-action": {
      "post": {
        "tags": [
          "管理后台-玩家管理 (Admin Players)"
        ],
        "summary": "玩家快捷运维指令 (GM 快捷操作)",
        "description": "玩家快捷运维指令 (GM 快捷操作)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/npc-templates": {
      "get": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "获取 NPC 模板列表",
        "description": "获取 NPC 模板列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "新建 NPC 模板",
        "description": "新建 NPC 模板",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/npc-templates/{id}": {
      "get": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "获取单个 NPC 模板",
        "description": "获取单个 NPC 模板",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "更新 NPC 模板",
        "description": "更新 NPC 模板",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "删除 NPC 模板（被地图实例或战斗配置引用时阻断）",
        "description": "删除 NPC 模板（被地图实例或战斗配置引用时阻断）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npc-attributes/config": {
      "get": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "成长配置总览：供后台展示四种成长模板、四档品质与境界加成",
        "description": "成长配置总览：供后台展示四种成长模板、四档品质与境界加成",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npc-attributes/preview": {
      "get": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "也可不传 templateId，直接查看成长模板：?growthTemplate=warrior&levels=1,10,20",
        "description": "查看某个 NPC 模板 / 成长模板在不同等级的成长属性",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npc-attributes/preview-batch": {
      "post": {
        "tags": [
          "管理后台-NPC模板 (Admin NPC Templates)"
        ],
        "summary": "body: { slots: [{ slot_index, template_id, level, quality, hp_override... }] }",
        "description": "战斗配置槽位实时预览：前端编辑等级/品质时由服务端统一计算",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/npc-instances": {
      "get": {
        "tags": [
          "管理后台-NPC实例 (Admin NPC Instances)"
        ],
        "summary": "NPC 实例列表（全量，可按类型/状态/来源/归属玩家/关键字筛选）",
        "description": "NPC 实例列表（全量，可按类型/状态/来源/归属玩家/关键字筛选）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npc-instances/{id}": {
      "patch": {
        "tags": [
          "管理后台-NPC实例 (Admin NPC Instances)"
        ],
        "summary": "更新 NPC 实例的可管理字段（名称/等级/状态）",
        "description": "更新 NPC 实例的可管理字段（名称/等级/状态）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-NPC实例 (Admin NPC Instances)"
        ],
        "summary": "如果是地图 WORLD 实例，且存在未清理的剧情路由/对话节点，会予以拦截。",
        "description": "删除 NPC 实例",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/monster-groups": {
      "get": {
        "tags": [
          "管理后台-战斗怪群 (Admin Monster Groups)"
        ],
        "summary": "获取战斗配置列表",
        "description": "获取战斗配置列表",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-战斗怪群 (Admin Monster Groups)"
        ],
        "summary": "body: { id?, name, members: [{ slot_index, template_id, level, position, is_boss, hp_override... }] }",
        "description": "新建战斗配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/monster-groups/{id}": {
      "get": {
        "tags": [
          "管理后台-战斗怪群 (Admin Monster Groups)"
        ],
        "summary": "获取单个战斗配置",
        "description": "获取单个战斗配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-战斗怪群 (Admin Monster Groups)"
        ],
        "summary": "更新战斗配置",
        "description": "更新战斗配置",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-战斗怪群 (Admin Monster Groups)"
        ],
        "summary": "删除战斗配置（被地图 NPC 实例引用时阻断）",
        "description": "删除战斗配置（被地图 NPC 实例引用时阻断）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npcs": {
      "get": {
        "tags": [
          "管理后台-地图NPC (Admin World NPCs)"
        ],
        "summary": "获取地图 NPC 实例列表（可按 sceneId 过滤）",
        "description": "获取地图 NPC 实例列表（可按 sceneId 过滤）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-地图NPC (Admin World NPCs)"
        ],
        "summary": "body: { scene_id, template_id, name?, title?, avatar?, badge?, type?, battle_group_id?, ... }",
        "description": "在地图上创建 NPC 实例",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/adminUser": {
      "get": {
        "tags": [
          "管理后台-地图NPC (Admin World NPCs)"
        ],
        "summary": "GET /api/admin/adminUser",
        "description": "GET /api/admin/adminUser",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/npcs/{id}": {
      "put": {
        "tags": [
          "管理后台-地图NPC (Admin World NPCs)"
        ],
        "summary": "更新地图 NPC 实例（支持跨场景移动）",
        "description": "更新地图 NPC 实例（支持跨场景移动）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-地图NPC (Admin World NPCs)"
        ],
        "summary": "删除地图 NPC 实例（仍有对话节点时阻断）",
        "description": "删除地图 NPC 实例（仍有对话节点时阻断）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/items": {
      "get": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "获取道具字典列表（用于配置战利品掉落、奖励、信物）",
        "description": "获取道具字典列表（用于配置战利品掉落、奖励、信物）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/medicines": {
      "get": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "获取药品列表 (支持 search 搜索、quality 品质过滤、status 上架状态过滤、分页)",
        "description": "获取药品列表 (支持 search 搜索、quality 品质过滤、status 上架状态过滤、分页)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "新增药品",
        "description": "新增药品",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/medicines/{id}": {
      "get": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "获取单个药品详情",
        "description": "获取单个药品详情",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "编辑/更新药品",
        "description": "编辑/更新药品",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "删除药品",
        "description": "删除药品",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/medicines/{id}/status": {
      "patch": {
        "tags": [
          "管理后台-丹药名品 (Admin Medicines)"
        ],
        "summary": "快速上架 / 下架药品",
        "description": "快速上架 / 下架药品",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/dialogues/packages": {
      "get": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "获取剧本资产列表（含节点数量、绑定地图 NPC 数量统计）",
        "description": "获取剧本资产列表（含节点数量、绑定地图 NPC 数量统计）",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "创建新剧本资产",
        "description": "创建新剧本资产",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/dialogues/packages/{id}": {
      "get": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "获取单个剧本详情及其全部节点与选项有向图",
        "description": "获取单个剧本详情及其全部节点与选项有向图",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "更新剧本元数据",
        "description": "更新剧本元数据",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "删除剧本资产",
        "description": "删除剧本资产",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/dialogues/nodes": {
      "post": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "新增/更新对话节点",
        "description": "新增/更新对话节点",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/dialogues/nodes/{id}": {
      "delete": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "删除对话节点及其选项",
        "description": "删除对话节点及其选项",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/dialogues/options": {
      "post": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "新增/更新对话分支选项",
        "description": "新增/更新对话分支选项",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/dialogues/options/{id}": {
      "delete": {
        "tags": [
          "管理后台-剧情剧本 (Admin Dialogues)"
        ],
        "summary": "删除对话选项",
        "description": "删除对话选项",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "id 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/skills": {
      "get": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "获取技能列表 (支持 search 搜索、targetType/kind 筛选、status 过滤、分页)",
        "description": "获取技能列表 (支持 search 搜索、targetType/kind 筛选、status 过滤、分页)",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "post": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "新增技能",
        "description": "新增技能",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    },
    "/api/admin/skills/{skillKey}": {
      "get": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "获取单个技能详情",
        "description": "获取单个技能详情",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "skillKey",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "skillKey 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      },
      "put": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "修改技能",
        "description": "修改技能",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "skillKey",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "skillKey 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      },
      "delete": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "删除技能",
        "description": "删除技能",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "skillKey",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "skillKey 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ]
      }
    },
    "/api/admin/skills/{skillKey}/status": {
      "patch": {
        "tags": [
          "管理后台-神通功法 (Admin Skills)"
        ],
        "summary": "切换技能启用状态",
        "description": "切换技能启用状态",
        "responses": {
          "200": {
            "description": "操作成功",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "description": "请求参数有误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "服务器内部错误",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        },
        "parameters": [
          {
            "name": "skillKey",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            },
            "description": "skillKey 路径参数"
          }
        ],
        "security": [
          {
            "AdminCookieAuth": []
          },
          {
            "BearerAuth": []
          }
        ],
        "requestBody": {
          "required": false,
          "content": {
            "application/json": {
              "schema": {
                "type": "object"
              }
            }
          }
        }
      }
    }
  }
} as const;
