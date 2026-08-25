# Chương 1: Khởi động

VibeReader biến một file **Markdown sống** thành tài liệu đọc độc lập. Hãy mở file này trong VS Code, sửa vài dòng rồi lưu để xem cửa sổ reader cập nhật.

> Mục tiêu: cảm giác đọc giống một document/PDF reader, nhưng nguồn dữ liệu vẫn chỉ là Markdown thuần.

## Một bảng nhỏ

| Thành phần | Vai trò |
| --- | --- |
| Markdown | Source of truth |
| File watcher | Theo dõi thay đổi |
| Renderer | Chuyển Markdown thành giao diện |

## Code

```js
const idea = 'write markdown, read beautifully';
console.log(idea);
```

# Chương 2: Màu sắc

Mỗi chương đổi một sắc độ chính. Heading, quote, code, table và link đều có style riêng để tài liệu bớt cảm giác “README trắng đen”.

## Điều hướng

- `PageUp`: chương trước
- `PageDown`: chương sau
- `Ctrl + O`: mở thêm file
- `Ctrl + W`: đóng tab hiện tại

# Chương 3: Live update

Mở `sample.md` trong editor khác, thêm nội dung và **Save**. VibeReader sẽ tự reload file mà không cần bấm refresh.
