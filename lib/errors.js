'use strict';

class PipelineError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.details = details;
  }
}

module.exports = {
  PipelineError
};

