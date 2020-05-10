import csvParse from 'csv-parse';
import { getRepository, In, getCustomRepository } from 'typeorm';
import fs from 'fs';
import Transaction from '../models/Transaction';
import TransactionRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const categoryRepository = getRepository(Category);
    const transactionRepository = getCustomRepository(TransactionRepository);
    const contactsReadStream = fs.createReadStream(filePath);
    const parses = csvParse({
      from_line: 2,
    });

    const parseCSV = contactsReadStream.pipe(parses);

    const transactions: CSVTransaction[] = [];

    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;
      categories.push(category);
      transactions.push({ title, type, value, category });
    });
    await new Promise(resolve => parseCSV.on('end', resolve));

    const existentCategories = await categoryRepository.find({
      where: {
        title: In(categories),
      },
    });
    const existentCategoriesTitles = existentCategories.map(
      (categoy: Category) => categoy.title,
    );
    const addCategoryTitles = categories
      .filter(category => !existentCategoriesTitles.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);
    const newCategories = categoryRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoryRepository.save(newCategories);

    const finalCatgoriess = [...newCategories, ...existentCategories];
    const createdTransaction = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCatgoriess.find(
          category => category.title === transaction.category,
        ),
      })),
    );
    await transactionRepository.save(createdTransaction);
    await fs.promises.unlink(filePath);
    return createdTransaction;
  }
}

export default ImportTransactionsService;
