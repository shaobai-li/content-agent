---
name: ingest-file
description: 当用户上传任意附件，并表达“导入到知识库”、“入库”、“写入知识库”、“导入数据库”、“解析后入库”、“上传到知识库”等意图时，必须直接使用该技能，不需要查看文件内容。
---

# Ingest File（文件入库技能）

1. 设置`cwd=skills`后运行下面的命令，
```
python scripts\import.py --i <上传的附件文件路径> --o <知识库的路径>
```
说明:
<知识库目录的路径>: 用户指定的知识库所对应的路径；如果没有使用，使用上下文中的默认知识库的路径
**注意**:该skills为`bundled skills`
**注意**：默认知识库的路径在上下文中，不需要工具查看。如果用户指定了知识库的名称，去`databases.json`文件中寻找路径
**注意**：如果你意识到用户指定了错误的知识库名称或者路径，必须提醒用户，并立即停止操作，绝对不能使用默认数据库
**注意**：如果你意识到用户既没有指定知识库路径，且在上下文中也没有设置默认知识库路径，必须严格提醒用户"默认知识库未设置"，并立即停止操作。

2.检查<知识库目录的路径>下的wiki目录的完整性，若找不到：
    ## wiki目录
    ## wiki目录下的任一子目录：`sources`,`concepts`,`entities`,`syntheses`
    ## `wiki\sources\model_source.md`
则直接执行以下指令，不需要查看文件是否存在
```
mkdir <知识库目录的路径>\wiki\
cp -rf templates\* <知识库目录的路径>\wiki\
```

3. 从<知识库目录的路径>完整读取生成的md文件

4. 从`<知识库目录的路径>\wiki`目录读取`index.md`和`overview.md`

5. 生成总结该文件的source页面
**注意**：在 `wiki\sources\` 下创建新的 `.md` 文件。文件名使用 `kebab-case`
**注意**：读取`wiki\sources\model_source.md`学习如何写source页面后严格按照其格式要求完成souce页面的编写

6. 更新`index.md`和`overview.md`与`source`有关的部分

7. 从原文件中抽取出概念，学习`wiki\concepts\concepts_model.md`页面后严格按照其格式要求完成`concepts`的编写

8. 从原文件中抽取出实体，学习`wiki\entities\entities_model.md`页面后严格按照其格式要求完成`entities`的编写

9. 更新`index.md`的`entities`和`concepts`部分

10. 更新`log.md`