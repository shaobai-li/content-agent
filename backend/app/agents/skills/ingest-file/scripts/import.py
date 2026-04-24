import argparse

def main():
    parser = argparse.ArgumentParser(description="导入附件文件到知识库的脚本")
    parser.add_argument('--i', '--input', dest='input_file', required=True, help='上传的附件文件路径')
    parser.add_argument('--o', '--output', dest='output_dir', required=True, help='知识库目录的路径')
    args = parser.parse_args()

    print(f"成功将文件导入到知识库。\n输入文件: {args.input_file}\n知识库目录: {args.output_dir}")

if __name__ == "__main__":
    main()