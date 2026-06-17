# 图像模板 meta.json 自适应规划

## 设计

### meta.json 结构

```json
{
  "version": 1,
  "dpi": 192,
  "screenWidth": 3840,
  "screenHeight": 2400,
  "windowRect": { "x": 100, "y": 50, "width": 1800, "height": 1000 },
  "relativePosition": { "x": 0.5, "y": 0.3 },
  "templateWidth": 120,
  "templateHeight": 60
}
```

字段说明：
- `dpi`：截取时系统 DPI（96=100%，192=200%）
- `screenWidth/Height`：截取时屏幕物理分辨率
- `windowRect`：截取时目标窗口的屏幕坐标（物理像素）
- `relativePosition`：模板在窗口内的归一化位置 (0~1)
- `templateWidth/Height`：模板图片像素尺寸

### 自适应匹配流程

```
findImage(template, opts)
│
├─ 加载 meta.json（如果存在）
│
├─ DPI 适配：
│  ├─ currentDpi != meta.dpi → 按比例缩放模板
│  └─ currentDpi == meta.dpi → 直接用原图
│
├─ 搜索区域优化：
│  ├─ 有 windowRect + 有当前窗口 rect → 用窗口 rect 作为搜索区域
│  └─ 有 relativePosition → 在窗口内进一步缩小搜索范围（可选）
│
└─ 执行匹配
```

### 实现分两层

**后端（Rust）：**
- `do_image_verify_sync`：读 meta.json → DPI 缩放模板 → 匹配
- `find_image` API：读 meta.json → DPI 缩放模板 → 匹配
- 新增工具函数：`meta.rs`（读取/写入/缩放）

**SDK（TypeScript）：**
- `resolveTemplate` 扩展：同时加载 meta.json，返回 `{ base64, meta? }`
- `findImage` 自动检测 meta.json 存在 → 传 meta 信息给后端
- 新增 `imageMeta.ts`（读取 meta.json）

---

## Task 分解

### Task 1: 后端 meta.rs — 读写 + DPI 缩放

**Files:**
- Create: `src/core/image_match/meta.rs`
- Modify: `src/core/image_match/mod.rs`

```rust
// meta.rs
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub version: u32,
    pub dpi: u32,
    pub screen_width: u32,
    pub screen_height: u32,
    pub window_rect: Option<crate::core::model::ElementRect>,
    pub relative_position: Option<RelativePosition>,
    pub template_width: u32,
    pub template_height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelativePosition {
    pub x: f32,
    pub y: f32,
}

impl ImageMeta {
    pub fn load(template_path: &str) -> Option<Self> {
        let meta_path = format!("{}.meta.json", template_path);
        let data = std::fs::read_to_string(&meta_path).ok()?;
        serde_json::from_str(&data).ok()
    }

    /// 当前 DPI 与截取时 DPI 不同时，计算缩放比例
    pub fn dpi_scale_factor(&self) -> f32 {
        let current_dpi = unsafe {
            windows::Win32::UI::HiDpi::GetDpiForSystem()
        };
        current_dpi as f32 / self.dpi as f32
    }

    /// 按 DPI 比例缩放模板图片
    pub fn scale_template(
        template: &image::ImageBuffer<image::Luma<u8>, Vec<u8>>,
        scale: f32,
    ) -> image::ImageBuffer<image::Luma<u8>, Vec<u8>> {
        if (scale - 1.0).abs() < 0.01 {
            return template.clone();
        }
        let (w, h) = template.dimensions();
        let new_w = (w as f32 * scale).round() as u32;
        let new_h = (h as f32 * scale).round() as u32;
        let dynamic = image::DynamicImage::ImageLuma8(template.clone());
        let resized = dynamic.resize(new_w, new_h, image::imageops::FilterType::Lanczos3);
        resized.to_luma8()
    }
}
```

### Task 2: 后端 do_image_verify_sync 集成 meta

**Files:**
- Modify: `src/gui/iced_app.rs`

在 `do_image_verify_sync` 中：
1. 加载 meta.json（如果存在）
2. DPI 不匹配时缩放模板
3. 返回结果时带上缩放信息

### Task 3: 后端 find_image API 集成 meta

**Files:**
- Modify: `src/api/image_match.rs`

在 `find_image` handler 中：
1. 新增可选字段 `meta: Option<ImageMeta>`（客户端传入）
2. 有 meta 时按 DPI 缩放模板

### Task 4: 后端写 meta.json — save_element_image 增强

**Files:**
- Modify: `src/api/image_match.rs`（save_element_image）
- Modify: `src/gui/iced_app.rs`（GUI F8 保存时）

捕获模板时同时生成 meta.json，记录当前 DPI、窗口 rect、相对位置。

### Task 5: SDK imageMeta.ts + resolveTemplate 扩展

**Files:**
- Create: `win-element-selector-sdk/src/image-meta.ts`
- Modify: `win-element-selector-sdk/src/image-template.ts`
- Modify: `win-element-selector-sdk/src/flow.ts`

SDK 自动检测 `<template>.meta.json` 存在，加载并传给后端。

### Task 6: 单测 + 构建验证

### Task 7: 更新规划文档

---

## 硬依赖

Task 1 → Task 2,3,4（后端基础）→ Task 5（SDK 层）→ Task 6（验证）

## 不做

- 不做相对位置自动缩小搜索范围（太复杂，先只做 DPI 缩放）
- 不做运行时 meta 更新（模板在窗口内移动了自动修正）
- 不做 meta 版本迁移
