# 点击偏移配置指南

## 概述

本功能为所有鼠标交互操作（click、rightClick 等）提供灵活的坐标偏移配置，避免使用精确的元素中心点，有效规避 RPA 场景中的反机器人检测机制。

## 核心特性

- ✅ **避免中心点**：不再使用精确的元素中心坐标
- ✅ **完全随机分布**：在指定区域内完全随机选择坐标
- ✅ **灵活配置**：支持预设位置和自定义表达式
- ✅ **可见性保障**：自动与 visibleRect 进行二次校验，确保不会点到被遮挡的区域

## 使用方法

### 1. 预设位置

最简单的使用方式，直接指定预设的位置：

```typescript
// 在顶部区域随机点击（距离上边缘 10px 范围内）
await button.click({ offset: 'top' });

// 在底部区域随机点击
await button.click({ offset: 'bottom' });

// 在左侧区域随机点击
await button.click({ offset: 'left' });

// 在右侧区域随机点击
await button.click({ offset: 'right' });

// 在中心区域随机点击（结合 randomRange 使用）
await button.click({ 
    offset: 'center',
    randomRange: 0.8  // 在中心 80% 区域内随机
});
```

### 2. 自定义表达式

使用字符串表达式精确控制偏移位置：

#### 语法格式

```
{reference}{operator}{value}{unit}
```

- **reference**: `left` | `right` | `top` | `bottom`
- **operator**: `+` | `-`
- **value**: 数字（支持小数）
- **unit**: `%` | `px`

#### 示例

```typescript
// 距离左边 20% 的位置（向内）
await button.click({ offset: 'left+20%' });

// 距离右边 5% 的位置（向内）
await button.click({ offset: 'right-5%' });

// 距离顶部向下 30px（向内）
await button.click({ offset: 'top+30px' });

// 距离底部向下 10px（向外，可能超出元素）
await button.click({ offset: 'bottom-10px' });

// 混合使用百分比和像素
await button.click({ offset: 'left+25%' });
await button.click({ offset: 'top+50px' });
```

#### 表达式说明

| 表达式 | 含义 | 计算方式 |
|--------|------|----------|
| `left+20%` | 距离左边 20% 的位置（向内） | x = 元素宽度 × 20% |
| `right-5%` | 距离右边 5% 的位置（向内） | x = 元素宽度 × (100% - 5%) |
| `top+30px` | 距离顶部向下 30px（向内） | y = 30px |
| `bottom-10px` | 距离底部向下 10px（向外） | y = 元素高度 + 10px |

**注意**：
- `+` 和 `-` 的语义取决于参考边：
  - **left/top**: `+` 表示向正方向移动（向右/向下，即向内），`-` 表示向外
  - **right/bottom**: `-` 表示向负方向移动（向左/向上，即向内），`+` 表示向外
- 最终点击位置会在偏移点周围 ±10px 范围内随机选择

### 3. 右键点击

右键点击同样支持 offset 配置：

```typescript
// 使用默认配置（center）
await button.rightClick();

// 自定义偏移
await button.rightClick('name', 'automationId');  // 通过属性定位
```

目前 rightClick 方法默认使用 `offset: 'center'`，如需自定义，可以修改源码或等待后续版本支持传入 options。

## 优先级规则

当同时配置多个选项时，优先级如下：

```
offset > clickArea > randomRange
```

### 示例

```typescript
// offset 优先级最高，clickArea 会被忽略
await button.click({
    offset: 'top',
    clickArea: { top: 0.3 },  // 这个会被忽略
    randomRange: 0.5           // 这个也会被忽略
});

// 没有 offset 时，使用 clickArea
await button.click({
    clickArea: { left: 0.2, right: 0.2 },
    randomRange: 0.5
});

// 都没有时，使用 randomRange（以中心为基准）
await button.click({
    randomRange: 0.8
});
```

## visibleRect 二次校验

系统会自动将计算的点击区域与元素的 `visibleRect`（可见区域）进行交集运算，确保：

1. **不会点到被遮挡的区域**：如果元素部分被其他窗口遮挡，只会在可见部分点击
2. **智能降级**：如果 offset 指定的区域完全不可见，会自动降级到 visibleRect 内随机点击

### 示例场景

```typescript
// 假设按钮的上半部分被弹窗遮挡
// offset: 'top' 指定的区域不可见
await button.click({ offset: 'top' });

// 系统会检测到 top 区域与 visibleRect 无交集
// 自动降级到 visibleRect（可见的下半部分）内随机点击
```

## 最佳实践

### 1. 按钮点击

对于普通按钮，建议使用 `center` + 较大的 `randomRange`：

```typescript
await submitButton.click({
    offset: 'center',
    randomRange: 0.7  // 在中心 70% 区域内随机
});
```

### 2. 菜单项点击

对于菜单项，建议点击左侧或中间偏左：

```typescript
await menuItem.click({
    offset: 'left+15%'  // 距离左边 15% 的位置
});
```

### 3. 链接点击

对于文本链接，建议点击中间区域：

```typescript
await link.click({
    offset: 'center',
    randomRange: 0.6
});
```

### 4. 复选框/单选框

对于小控件，建议精确控制：

```typescript
await checkbox.click({
    offset: 'center',
    randomRange: 0.9  // 几乎覆盖整个控件
});
```

### 5. 避免边缘

某些 UI 框架的边缘可能有边框或阴影，建议避开：

```typescript
// 不要直接点击最边缘
await button.click({ offset: 'left' });  // ❌ 可能点到边框

// 稍微向内偏移
await button.click({ offset: 'left+5%' });  // ✅ 更安全
```

## 与 clickArea 的区别

| 特性 | offset | clickArea |
|------|--------|-----------|
| **配置方式** | 字符串表达式或预设位置 | 对象形式，指定各边排除比例 |
| **灵活性** | 高，支持精确定位 | 中，只能指定区域范围 |
| **适用场景** | 需要特定位置点击 | 需要排除某些区域 |
| **优先级** | 高 | 低 |

### 对比示例

```typescript
// 使用 offset：点击距离左边 20% 的位置
await button.click({ offset: 'left+20%' });

// 使用 clickArea：排除左右各 20%，在中间 60% 区域随机
await button.click({
    clickArea: { left: 0.2, right: 0.2 }
});
```

## 常见问题

### Q1: 为什么我的点击位置超出了元素边界？

A: 如果你使用了 `-` 运算符（如 `top-10px`），这会向元素外部偏移。这是有意设计的，用于某些特殊场景。如果希望确保点击在元素内部，请使用 `+` 运算符或预设位置。

### Q2: offset 和 randomRange 如何配合使用？

A: 
- 对于预设位置（top/bottom/left/right），randomRange 不影响结果
- 对于 `center`，randomRange 控制中心区域的随机范围
- 对于自定义表达式，会在偏移点周围 ±10px 范围内随机

### Q3: 如何调试点击位置？

A: 启用日志记录可以看到实际的点击坐标：

```typescript
import { createFlow } from 'element-selector-sdk';

const flow = await createFlow({
    logging: {
        enabled: true,
        level: 'debug',
        showCoordinates: true  // 显示坐标信息
    }
});

const button = await flow.find('//Button');
await button.click({ offset: 'top' });
// 日志会输出：[click: (x, y), relative: (0.5, 0.1)]
```

### Q4: visibleRect 是如何计算的？

A: `visibleRect` 是元素矩形与窗口视口矩形的交集。如果元素部分被其他窗口遮挡或在屏幕外，visibleRect 会反映真正可见的部分。

## 技术细节

### 坐标计算流程

1. **解析 offset**：根据配置计算基准区域
2. **求交集**：与 visibleRect 进行交集运算
3. **随机选择**：在最终区域内完全随机选择坐标

### 降级策略

- 表达式解析失败 → 降级到 `center + randomRange`
- offset 区域与 visibleRect 无交集 → 降级到 visibleRect 内随机
- 无 visibleRect 信息 → 直接使用基准区域

## 版本历史

- **v1.1.0** (2026-05-29): 初始版本，支持 offset 配置和 visibleRect 二次校验
