# Element.xpath 双重类型指南

## 概述

`Element.xpath` 是一个**字符串与函数的双重类型**，既可以直接读取 XPath 字符串，也可以调用函数进行属性级重新查询。

```typescript
// 类型定义
xpath: string & ((...propNames: string[]) => Promise<Element>);
```

## 读取 XPath 字符串

```typescript
const el = await flow.find('//Button');

// 方式 1：直接作为字符串读取
console.log(el.xpath);

// 方式 2：通过 String() 转换
console.log(String(el.xpath));

// 方式 3：通过 toString() 方法
console.log(el.xpath.toString());

// 输出: "//Button"
```

## 属性级重新查询

调用 `el.xpath(...propNames)` 会在当前元素的 `elementSelector` 路径上**追加属性谓词**，重新查询更精确的元素。

### 自动选择属性（无参调用）

不传任何参数时，自动从 `automationId → name → className → frameworkId → controlType → helpText → itemType → itemStatus` 中选取有值的属性：

```typescript
const el = await flow.find('//Button');
// el.info.name = "发送"
// el.info.controlType = "Button"

const refined = await el.xpath();
// → "//Button[@Name='发送' and @ControlType='Button']"
```

### 指定单个属性

```typescript
const byName = await el.xpath('name');
// → "//Button[@Name='发送']"

const byAutomationId = await el.xpath('automationId');
// → "//Button[@AutomationId='btn-send']"
```

### 多属性组合

```typescript
const precise = await el.xpath('automationId', 'name');
// → "//Button[@AutomationId='btn-send' and @Name='发送']"
```

### 正确处理已有谓词

如果 `elementSelector` 已包含谓词，新谓词会正确插入：

```typescript
// 已有: /A/B[@className="X"]
const refined = await el.xpath('name');
// 结果: /A/B[@className="X" and @Name="Y"]

// 没有谓词: /A/B
const refined = await el.xpath('name');
// 结果: /A/B[@Name="Y"]
```

## 实际场景

### 场景 1：验证元素身份

```typescript
const article = await flow.find('//ListItem');
console.log('查询路径:', article.xpath);

// 用 name 属性重新验证
const verified = await article.xpath('name');
console.log('验证路径:', verified.xpath);
// → "//ListItem[@Name='公众号文章标题']"
```

### 场景 2：精确定位元素

```typescript
// 通用查询
const btn = await flow.find('//Button');
console.log(btn.xpath);  // "//Button"

// 精确到 automationId + name
const preciseBtn = await btn.xpath('automationId', 'name');
console.log(preciseBtn.xpath);  // "//Button[@AutomationId='submit' and @Name='提交']"
```

### 场景 3：条件化重新查询

```typescript
const el = await flow.find('//Edit');

if (el.info.automationId) {
    const byId = await el.xpath('automationId');
    await byId.click();
} else {
    const byName = await el.xpath('name');
    await byName.click();
}
```

## 属性名映射

传入的属性名会自动映射为 UIA 属性名：

| 传入名 | UIA 属性名 |
|--------|-----------|
| `name` | `Name` |
| `automationId` | `AutomationId` |
| `className` | `ClassName` |
| `frameworkId` | `FrameworkId` |
| `controlType` | `ControlType` |
| `helpText` | `HelpText` |
| `itemType` | `ItemType` |
| `itemStatus` | `ItemStatus` |

## 与 elementSelector 的区别

| 属性 | 类型 | 说明 |
|------|------|------|
| `el.elementSelector` | string | 创建时的原始 XPath，不可变 |
| `el.xpath` | string & function | 可读（同 elementSelector），可调（生成新查询） |

```typescript
const el = await flow.find('//Button');
console.log(el.elementSelector);  // "//Button"（原始值）
console.log(el.xpath);            // "//Button"（当前值）

const refined = await el.xpath('name');
console.log(refined.xpath);       // "//Button[@Name='发送']"（新值）
console.log(el.xpath);            // "//Button"（原始值不变）
```

## 注意事项

1. **属性为空时不添加谓词**：如果指定的属性值为空字符串，不会生成对应的谓词
2. **查询失败抛异常**：如果生成的 XPath 找不到元素，抛出 `ElementNotFoundError`
3. **返回新 Element 对象**：`xpath()` 返回新的 Element，不影响原始元素
4. **JSON 序列化**：`JSON.stringify` 时 `xpath` 函数会被丢弃，请使用 `el.elementSelector` 获取字符串
