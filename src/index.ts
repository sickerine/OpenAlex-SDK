// Empty file to make the 'types' directory a module.
import { AxiosResponse } from 'axios';
import fs from 'fs';
import {
  Author,
  Authors,
  AuthorsSearchParameters,
  ExternalIdsAuthor,
} from './types/author';
import {
  ExternalIdsInstitution,
  Institutions,
  SearchParametersInstitution,
} from './types/institution';
import {
  ExternalIdsSource,
  SearchParametersSource,
  Sources,
} from './types/source';
import { SearchParametersTopics, Topic, Topics } from './types/topic';
import { ExternalIdsWork, SearchParameters, Work, Works } from './types/work';
import {
  handleAllAuthorsPages,
  handleMultipleAuthorsPages,
  validateAuthorParameters,
} from './utils/authors';
import { convertToCSV } from './utils/exportCSV';
import {
  appendCursorToUrl,
  buildUrl,
  convertAbstractArrayToString,
  getCursorByPage,
} from './utils/helpers';
import { GET } from './utils/http';
import {
  handleAllInstitutionsPages,
  handleMultipleInstitutionsPages,
  validateInstitutionsParameters,
} from './utils/institutions';
import {
  handleAllSourcesPages,
  handleMultipleSourcesPages,
  validateSourcesParameters,
} from './utils/sources';
import {
  handleAllTopicsPages,
  handleMultipleTopicsPages,
  validateTopicsParameters,
} from './utils/topics';
import {
  handleAllPages,
  handleAllPagesInChunks,
  handleMultiplePages,
  validateParameters,
} from './utils/works';

export default class OpenAlex {
  email: string | null;
  apiKey: string | null;
  url: string = 'https://api.openalex.org';
  maxRetries: number = 3;
  retryDelay: number = 1000;
  retryHttpCodes: number[] = [429, 500, 502, 503, 504];

  constructor(email: string | null = null, apiKey: string | null = null) {
    this.email = email;
    this.apiKey = apiKey;
  }

  /**
   * The function `work` retrieves a specific work by its ID and returns it as a Promise.
   * @param {string} id - The `id` parameter is a string that represents the unique identifier of a
   * work. It is used to retrieve a specific work from the server.
   * @returns {Promise<Work>}a Promise that resolves to a Work object.
   */
  async work(id: string, externalIds?: ExternalIdsWork): Promise<Work> {
    let url = '';
    if (externalIds) url = `${this.url}/works/${externalIds}:${id}`;
    else url = `${this.url}/works/${id}`;
    const response: AxiosResponse<Work> = await GET(url);
    if (response.status === 200) {
      return response.data;
    }
    if (response.status === 404) {
      console.log(`Work with id ${id} not found`);
    } else {
      console.log(`Error ${response.status}: ${response.statusText}`);
    }
    // return empty work
    return {
      id: id,
      biblio: {},
      counts_by_year: [],
    };
  }

  /**
   * The function `works` retrieves a list of works and returns them as a Promise.
   * @param {SearchParameters} searchParameters - The `searchParameters` parameter is an object that
   * contains the parameters used to search for works. It is used to retrieve a list of works from the server.
   * - `search` is a string that represents the search query.
   * - `searchField` is a string that represents the field to search in.
   * - `perPage` is a number that represents the number of works to retrieve per page.
   * - `page` is a number that represents the page number to retrieve.
   * - `retriveAllPages` is a boolean that represents whether to retrieve all pages.
   * - `toCsv` is a string that represents the name of the CSV file to save the results to.
   * - `toJson` is a string that represents the name of the JSON file to save the results to.
   * - `startPage` is a number that represents the start page to retrieve.
   * - `endPage` is a number that represents the end page to retrieve.
   * - `filter` is an object that represents the filter parameters to use.
   * - `groupBy` is a string that represents the field to group by.
   * - `sortBy` is an object that represents the field to sort by.
   *
   * @remarks Don't use `startPage` and `endPage` with `retriveAllPages` at the same time.
   *
   * @returns {Promise<Works>} a Promise that resolves to a Works object.
   *
   * @see {@link SearchParameters} for the search parameters.
   * @see {@link Works} for the returned data structure.
   *
   * @throws {Error} if the response status is not 200.
   *
   * @default
   * perPage=25
   * page=1
   * retriveAllPages=false
   *
   * @example
   * const res = await openAlex.works({
   *    search: 'education',
   *    searchField: 'title',
   *    perPage: 1,
   *    filter: {
   *      has_fulltext: true,
   *    },
   *    toCsv: 'test100',
   *    startPage: 1,
   *    endPage: 2,
   *  });
   *
   * @example
   * const res = await openAlex.works({
   *    search: 'education',
   *    searchField: 'title',
   *    perPage: 50,
   *    filter: {
   *      has_fulltext: true,
   *    },
   *    toJson: 'test100',
   *    page: 20,
   *    groupBy: 'publication_year',
   *    sortBy: {
   *      field: 'display_name',
   *      order: 'desc',
   *    },
   *  });
   * @see {@link https://docs.openalex.org/api-entities/works/search-works OpenAlex API Documentation }
   * for more information about the works endpoint.
   */
  async works(
    searchParameters: SearchParameters = {
      perPage: 25,
      page: 1,
      retriveAllPages: false,
    },
  ): Promise<Works> {
    const {
      retriveAllPages,
      searchField,
      search,
      toJson,
      toCsv,
      startPage,
      endPage,
      filter,
      groupBy: group_by,
      sortBy,
      AbstractArrayToString,
      chunkSize,
    } = searchParameters;
    let { perPage } = searchParameters;
    let { page } = searchParameters;
    validateParameters(
      retriveAllPages,
      startPage,
      endPage,
      searchField,
      chunkSize,
      toCsv,
      toJson,
    );

    let url = buildUrl(
      this.url,
      'works',
      search,
      searchField,
      filter,
      group_by,
      sortBy,
    );
    let cursor = await getCursorByPage(url, page, perPage);
    if (retriveAllPages) {
      perPage = 200;
      cursor = '*';
    }

    if (startPage && endPage) {
      page = startPage;
      cursor = await getCursorByPage(url, startPage, perPage);
    }

    url = appendCursorToUrl(url, perPage, cursor, retriveAllPages);

    const response: AxiosResponse<Works> = await GET(url);

    if (response.status === 200) {
      response.data.meta.page = page ?? 1;

      if (AbstractArrayToString) {
        response.data.results = response.data.results.map((work) => {
          if (work.abstract_inverted_index)
            work.abstract = convertAbstractArrayToString(
              work.abstract_inverted_index,
            );
          delete work.abstract_inverted_index;
          return work;
        });
      }
      if (startPage && endPage) {
        return handleMultiplePages(
          startPage,
          endPage,
          url,
          response,
          toJson,
          toCsv,
          AbstractArrayToString,
        );
      }

      if (retriveAllPages) {
        if (chunkSize)
          handleAllPagesInChunks(
            url,
            response,
            toJson,
            toCsv,
            AbstractArrayToString,
            chunkSize,
          );
        else
          return handleAllPages(
            url,
            response,
            toJson,
            toCsv,
            AbstractArrayToString,
          );
      }

      if (toJson)
        fs.writeFileSync(
          `${toJson}.json`,
          JSON.stringify(response.data, null, 2),
        );
      if (toCsv) {
        convertToCSV(response.data.results, toCsv);
      }
      response.data.meta.url = url;
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * The function `autoCompleteWorks` retrieves a list of works that match the search query
   * and returns them as a Promise.
   * @param {string} search - The `search` parameter is a string that represents the search query.
   * It is used to retrieve a list of works that match the search query from the server.
   * @returns {Promise<Works>} a Promise that resolves to a Works object.
   * @throws {Error} if the response status is not 200.
   * @example
   * const res = await openAlex.autoCompleteWorks('education');
   * @see {@link https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/autocomplete-entities OpenAlex API Documentation }
   * for more information about the autocomplete endpoint.
   */
  async autoCompleteWorks(search: string): Promise<Works> {
    const response: AxiosResponse<Works> = await GET(
      `${this.url}/autocomplete/works?q=${search}`,
    );
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * The function `ngram` retrieves a list of ngrams for a specific work by its ID and returns them as a Promise.
   *
   * @param {string} id - The `id` parameter is a string that represents the unique identifier of a
   * work. It is used to retrieve a list of ngrams for a specific work from the server.
   * @throws {Error} if the response status is not 200.
   * @example
   * const res = await openAlex.ngram('work_id');
   * @see {@link https://docs.openalex.org/api-entities/works/get-n-grams OpenAlex API Documentation }
   * for more information about the ngram endpoint.
   */
  async ngram(id: string) {
    const response: AxiosResponse<Work> = await GET(
      `${this.url}/works/${id}/ngram`,
    );
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * The function `author` retrieves a specific author by its ID and returns them as a Promise.
   * @param {string} id - The `id` parameter is a string that represents the unique identifier of an
   * author. It is used to retrieve a specific author from the server.
   * @throws {Error} if the response status is not 200.
   * @example
   * const res = await openAlex.author('author_id');
   * @see {@link https://docs.openalex.org/api-entities/authors/get-authors OpenAlex API Documentation }
   * for more information about the author endpoint.
   */
  async author(id: string, externalIds?: ExternalIdsAuthor) {
    let url = '';
    if (externalIds) url = `${this.url}/authors/${externalIds}:${id}`;
    else url = `${this.url}/authors/${id}`;
    const response: AxiosResponse<Author> = await GET(url);
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * The function `authors` retrieves a list of authors and returns them as a Promise.
   * @param {SearchParameters} searchParameters - The `searchParameters` parameter is an object that
   * contains the parameters used to search for authors. It is used to retrieve a list of authors from the server.
   * - `search` is a string that represents the search query.
   * - `searchField` is a string that represents the field to search in.
   * - `perPage` is a number that represents the number of authors to retrieve per page.
   * - `page` is a number that represents the page number to retrieve.
   * - `retriveAllPages` is a boolean that represents whether to retrieve all pages.
   * - `toCsv` is a string that represents the name of the CSV file to save the results to.
   * - `toJson` is a string that represents the name of the JSON file to save the results to.
   * - `startPage` is a number that represents the start page to retrieve.
   * - `endPage` is a number that represents the end page to retrieve.
   * - `filter` is an object that represents the filter parameters to use.
   * - `groupBy` is a string that represents the field to group by.
   * - `sortBy` is an object that represents the field to sort by.
   *
   * @remarks Don't use `startPage` and `endPage` with `retriveAllPages` at the same time.
   *
   * @returns {Promise<Authors>} a Promise that resolves to a Authors object.
   *
   * @see {@link SearchParameters} for the search parameters.
   * @see {@link Authors} for the returned data structure.
   *
   * @throws {Error} if the response status is not 200.
   *
   * @default
   * perPage=25
   * page=1
   * retriveAllPages=false
   *
   * @example
   * const res = await openAlex.authors({
   *    search: 'education',
   *    searchField: 'title',
   *    perPage: 1,
   *    filter: {
   *      has_fulltext: true,
   *    },
   *    toCsv: 'test100',
   *    startPage:
   *   endPage: 2,
   * });
   * @example
   * const res = await openAlex.authors({
   *   search: 'education',
   *  searchField: 'title',
   * perPage: 50,
   * filter: {
   *  has_fulltext: true,
   * },
   * toJson: 'test100',
   * page: 20,
   * groupBy: 'publication_year',
   * sortBy: {
   * field: 'display_name',
   * order: 'desc',
   * },
   * });
   * @see {@link https://docs.openalex.org/api-entities/authors/search-authors OpenAlex API Documentation }
   * for more information about the authors endpoint.
   * */
  async authors(
    searchParameters: AuthorsSearchParameters = {
      perPage: 25,
      page: 1,
      retriveAllPages: false,
    },
  ) {
    const {
      retriveAllPages,
      searchField,
      search,
      toJson,
      toCsv,
      startPage,
      endPage,
      filter,
      groupBy,
      sortBy,
    } = searchParameters;
    let { perPage } = searchParameters;
    let { page } = searchParameters;
    validateAuthorParameters(retriveAllPages, startPage, endPage, searchField);

    let url = buildUrl(
      this.url,
      'authors',
      search,
      searchField,
      filter,
      groupBy,
      sortBy,
    );
    let cursor = await getCursorByPage(url, page, perPage);
    if (retriveAllPages) {
      perPage = 200;
      cursor = '*';
    }

    if (startPage && endPage) {
      page = startPage;
      cursor = await getCursorByPage(url, startPage, perPage);
    }

    url = appendCursorToUrl(url, perPage, cursor, retriveAllPages);

    const response: AxiosResponse<Authors> = await GET(url);

    if (response.status === 200) {
      response.data.meta.page = page ?? 1;

      if (startPage && endPage) {
        return handleMultipleAuthorsPages(
          startPage,
          endPage,
          url,
          response,
          toJson,
          toCsv,
        );
      }

      if (retriveAllPages) {
        return handleAllAuthorsPages(url, response, toJson, toCsv);
      }

      if (toJson)
        fs.writeFileSync(
          `${toJson}.json`,
          JSON.stringify(response.data, null, 2),
        );
      if (toCsv) {
        convertToCSV(response.data.results, toCsv);
      }
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  async source(id: string, externalIds?: ExternalIdsSource) {
    let url = '';
    if (externalIds) url = `${this.url}/sources/${externalIds}:${id}`;
    else url = `${this.url}/sources/${id}`;
    const response: AxiosResponse<Author> = await GET(url);
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  async sources(
    searchParameters: SearchParametersSource = {
      perPage: 25,
      page: 1,
      retriveAllPages: false,
    },
  ) {
    const {
      retriveAllPages,
      searchField,
      search,
      toJson,
      toCsv,
      startPage,
      endPage,
      filter,
      groupBy,
      sortBy,
    } = searchParameters;
    let { perPage } = searchParameters;
    let { page } = searchParameters;
    validateSourcesParameters(retriveAllPages, startPage, endPage, searchField);

    let url = buildUrl(
      this.url,
      'sources',
      search,
      searchField,
      filter,
      groupBy,
      sortBy,
    );
    let cursor = await getCursorByPage(url, page, perPage);
    if (retriveAllPages) {
      perPage = 200;
      cursor = '*';
    }

    if (startPage && endPage) {
      page = startPage;
      cursor = await getCursorByPage(url, startPage, perPage);
    }

    url = appendCursorToUrl(url, perPage, cursor, retriveAllPages);

    const response: AxiosResponse<Sources> = await GET(url);

    if (response.status === 200) {
      response.data.meta.page = page ?? 1;

      if (startPage && endPage) {
        return handleMultipleSourcesPages(
          startPage,
          endPage,
          url,
          response,
          toJson,
          toCsv,
        );
      }

      if (retriveAllPages) {
        return handleAllSourcesPages(url, response, toJson, toCsv);
      }

      if (toJson)
        fs.writeFileSync(
          `${toJson}.json`,
          JSON.stringify(response.data, null, 2),
        );
      if (toCsv) {
        convertToCSV(response.data.results, toCsv);
      }
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }

  async institution(id: string, externalIds?: ExternalIdsInstitution) {
    let url = '';
    if (externalIds) url = `${this.url}/institutions/${externalIds}:${id}`;
    else url = `${this.url}/institutions/${id}`;
    const response: AxiosResponse<Author> = await GET(url);
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  async institutions(
    searchParameters: SearchParametersInstitution = {
      perPage: 25,
      page: 1,
      retriveAllPages: false,
    },
  ) {
    const {
      retriveAllPages,
      searchField,
      search,
      toJson,
      toCsv,
      startPage,
      endPage,
      filter,
      groupBy,
      sortBy,
    } = searchParameters;
    let { perPage } = searchParameters;
    let { page } = searchParameters;
    validateInstitutionsParameters(
      retriveAllPages,
      startPage,
      endPage,
      searchField,
    );

    let url = buildUrl(
      this.url,
      'institutions',
      search,
      searchField,
      filter,
      groupBy,
      sortBy,
    );
    let cursor = await getCursorByPage(url, page, perPage);
    if (retriveAllPages) {
      perPage = 200;
      cursor = '*';
    }

    if (startPage && endPage) {
      page = startPage;

      cursor = await getCursorByPage(url, startPage, perPage);
    }

    url = appendCursorToUrl(url, perPage, cursor, retriveAllPages);

    const response: AxiosResponse<Institutions> = await GET(url);

    if (response.status === 200) {
      response.data.meta.page = page ?? 1;

      if (startPage && endPage) {
        return handleMultipleInstitutionsPages(
          startPage,
          endPage,
          url,
          response,
          toJson,
          toCsv,
        );
      }

      if (retriveAllPages) {
        return handleAllInstitutionsPages(url, response, toJson, toCsv);
      }

      if (toJson)
        fs.writeFileSync(
          `${toJson}.json`,
          JSON.stringify(response.data, null, 2),
        );
      if (toCsv) {
        convertToCSV(response.data.results, toCsv);
      }
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  async topic(id: string) {
    if (!id) throw new Error('Topic id is required');
    const response: AxiosResponse<Topic> = await GET(
      `${this.url}/topics/${id}`,
    );
    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
  async topics(
    searchParameters: SearchParametersTopics = {
      perPage: 25,
      page: 1,
      retriveAllPages: false,
    },
  ) {
    const {
      retriveAllPages,
      searchField,
      search,
      toJson,
      toCsv,
      startPage,
      endPage,
      filter,
      groupBy,
      sortBy,
    } = searchParameters;
    let { perPage } = searchParameters;
    let { page } = searchParameters;
    validateTopicsParameters(retriveAllPages, startPage, endPage, searchField);

    let url = buildUrl(
      this.url,
      'topics',
      search,
      searchField,
      filter,
      groupBy,
      sortBy,
    );
    let cursor = await getCursorByPage(url, page, perPage);
    if (retriveAllPages) {
      perPage = 200;
      cursor = '*';
    }

    if (startPage && endPage) {
      page = startPage;

      cursor = await getCursorByPage(url, startPage, perPage);
    }

    url = appendCursorToUrl(url, perPage, cursor, retriveAllPages);

    const response: AxiosResponse<Topics> = await GET(url);

    if (response.status === 200) {
      response.data.meta.page = page ?? 1;

      if (startPage && endPage) {
        return handleMultipleTopicsPages(
          startPage,
          endPage,
          url,
          response,
          toJson,
          toCsv,
        );
      }

      if (retriveAllPages) {
        return handleAllTopicsPages(url, response, toJson, toCsv);
      }

      if (toJson)
        fs.writeFileSync(
          `${toJson}.json`,
          JSON.stringify(response.data, null, 2),
        );
      if (toCsv) {
        convertToCSV(response.data.results, toCsv);
      }
      return response.data;
    } else {
      throw new Error(`Error ${response.status}: ${response.statusText}`);
    }
  }
}
